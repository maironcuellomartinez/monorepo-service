// src/infrastructure/external/connectors/droppoint.connector.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
    BaseExternalConnector,
    ConnectorConfig,
    ConnectorError,
    OperationContext,
} from 'src/domain/interfaces/external-connector.interface';

export type DroppointState =
    | 'RESERVADO'
    | 'CARGADO'
    | 'AUTORIZADO'
    | 'RECOGIDO'
    | 'RETORNADO'
    | 'CANCELADO';

export interface DroppointShipment {
    id: number;
    external_id: string;
    state: DroppointState;
    machine_ref: string;
    box_name?: string;
    box_size?: string;
    qr_codes?: string[];
}

export interface DroppointFreeBox {
    box_name: string;
    box_size: string;
    machine_ref: string;
}

export interface CreateShipmentRequest {
    /** Identifies the locker machine — corresponds to corner.placename */
    machine_ref: string;
    /** Links to incident: format "<issueId>_<msgId>_local" */
    external_id: string;
    /** Internal user identifier (UPN / matricula) */
    user_inquire: string;
    /** Box size: S, M, L, XL */
    box_size: 'S' | 'M' | 'L' | 'XL';
}

export interface UpdateShipmentRequest {
    machine_ref: string;
    external_id: string;
    state: DroppointState;
}

@Injectable()
export class DroppointConnector extends BaseExternalConnector {
    readonly systemId = 'DROPPOINT';
    readonly systemName = 'Droppoint Lockers';
    readonly apiVersion = 'v5';

    private readonly logger = new Logger(DroppointConnector.name);
    private readonly baseUrl: string;
    private readonly authHeader: string;
    private readonly timeout: number;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        const baseUrl = configService.get<string>(
            'droppoint.baseUrl',
            'https://inetum.drop-point.com/company_api/v5',
        );
        const timeout = configService.get<number>('droppoint.timeout', 10000);

        const connectorConfig: ConnectorConfig = {
            baseUrl,
            timeout,
            retryPolicy: {
                maxRetries: 3,
                initialDelay: 500,
                maxDelay: 5000,
                multiplier: 2,
                jitter: true,
                retryableStatusCodes: [429, 500, 502, 503, 504],
                retryableErrors: ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'],
            },
            circuitBreaker: {
                failureThreshold: 5,
                successThreshold: 2,
                timeout: 30000,
                resetTimeout: 60000,
                halfOpenMaxCalls: 3,
            },
            authentication: {
                type: 'BASIC',
                credentials: {
                    username: configService.get<string>('droppoint.username', ''),
                    password: configService.get<string>('droppoint.password', ''),
                },
            },
        };

        super(connectorConfig);

        this.baseUrl = baseUrl;
        this.timeout = timeout;
        const username = configService.get<string>('droppoint.username', '');
        const password = configService.get<string>('droppoint.password', '');
        this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    // ─── IExternalConnector (abstract) ────────────────────────────────────────

    async execute(operation: string, payload: any): Promise<any> {
        switch (operation) {
            case 'createShipment':       return this.createShipment(payload);
            case 'updateShipmentState':  return this.updateShipmentState(payload);
            case 'cancelShipment':       return this.cancelShipment(payload.externalId, payload.machineRef);
            case 'getShipment':          return this.getShipment(payload.externalId);
            case 'getAvailableBoxes':    return this.getAvailableBoxes(payload.machineRef);
            default:
                throw new ConnectorError(
                    `Unknown operation: ${operation}`,
                    'UNKNOWN_OPERATION',
                    this.systemId,
                    operation,
                    undefined,
                    false,
                    'VALIDATION',
                );
        }
    }

    transformToExternalFormat(_operation: string, payload: any): any {
        return payload;
    }

    transformFromExternalFormat(_operation: string, externalData: any): any {
        return externalData;
    }

    handleError(error: any, context: OperationContext): ConnectorError {
        const status = error?.response?.status;

        if (status === 401 || status === 403) {
            return this.createConnectorError(
                `Droppoint authentication failed (${status})`,
                'AUTHENTICATION_ERROR',
                context.operation,
                error,
                false,
                'AUTHENTICATION',
            );
        }
        if (status === 404) {
            return this.createConnectorError(
                'Droppoint resource not found',
                'NOT_FOUND',
                context.operation,
                error,
                false,
                'DATA_NOT_FOUND',
            );
        }
        if (status >= 500) {
            return this.createConnectorError(
                `Droppoint service error (${status}): ${error.message}`,
                'SERVICE_ERROR',
                context.operation,
                error,
                true,
                'SERVICE_UNAVAILABLE',
            );
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return this.createConnectorError(
                `Droppoint timeout: ${error.message}`,
                'TIMEOUT',
                context.operation,
                error,
                true,
                'TIMEOUT',
            );
        }

        return this.createConnectorError(
            error.message ?? 'Droppoint unknown error',
            'UNKNOWN',
            context.operation,
            error,
        );
    }

    // ─── Queries ──────────────────────────────────────────────────────────────

    /**
     * Returns available locker slots for a given machine.
     * @param machineRef Corner placename as registered in Droppoint
     */
    async getAvailableBoxes(machineRef: string): Promise<DroppointFreeBox[]> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}/boxes/free`, {
                    params: { machine_ref: machineRef },
                    headers: this.buildHeaders(),
                    timeout: this.timeout,
                }),
            );

            this.logger.log(`Available boxes for machine ${machineRef}: ${response.data?.length ?? 0}`);
            return response.data ?? [];
        } catch (error) {
            this.logger.error(`Failed to get available boxes for ${machineRef}`, error.message);
            throw this.mapError(error);
        }
    }

    /**
     * Retrieves shipment details by external_id.
     */
    async getShipment(externalId: string): Promise<DroppointShipment | null> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}/shipments`, {
                    params: { external_id: externalId },
                    headers: this.buildHeaders(),
                    timeout: this.timeout,
                }),
            );

            return response.data ?? null;
        } catch (error) {
            if (error?.response?.status === 404) {
                return null;
            }
            this.logger.error(`Failed to get shipment ${externalId}`, error.message);
            throw this.mapError(error);
        }
    }

    // ─── Mutations ────────────────────────────────────────────────────────────

    /**
     * Creates a new shipment (reserves a locker slot).
     * Droppoint assigns box_name and returns QR codes.
     */
    async createShipment(request: CreateShipmentRequest): Promise<DroppointShipment> {
        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/shipments`,
                    request,
                    {
                        headers: this.buildHeaders(),
                        timeout: this.timeout,
                    },
                ),
            );

            const shipment: DroppointShipment = typeof response.data === 'string'
                ? JSON.parse(response.data)
                : response.data;

            this.logger.log(
                `Shipment created → external_id=${shipment.external_id} | box=${shipment.box_name} | state=${shipment.state}`,
            );

            return shipment;
        } catch (error) {
            this.logger.error('Failed to create shipment', { request, error: error.message });
            throw this.mapError(error);
        }
    }

    /**
     * Updates the state of an existing shipment.
     * Common transitions: RESERVADO → AUTORIZADO (tech authorizes pickup)
     */
    async updateShipmentState(request: UpdateShipmentRequest): Promise<DroppointShipment> {
        try {
            const response = await firstValueFrom(
                this.httpService.put(
                    `${this.baseUrl}/shipments/state`,
                    request,
                    {
                        headers: this.buildHeaders(),
                        timeout: this.timeout,
                    },
                ),
            );

            this.logger.log(
                `Shipment state updated → external_id=${request.external_id} | new state=${request.state}`,
            );

            return response.data;
        } catch (error) {
            this.logger.error('Failed to update shipment state', { request, error: error.message });
            throw this.mapError(error);
        }
    }

    /**
     * Cancels a shipment (releases the locker slot).
     */
    async cancelShipment(externalId: string, machineRef: string): Promise<void> {
        await this.updateShipmentState({
            external_id: externalId,
            machine_ref: machineRef,
            state: 'CANCELADO',
        });
        this.logger.log(`Shipment cancelled → external_id=${externalId}`);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private buildHeaders(): Record<string, string> {
        return {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
        };
    }

    private mapError(error: any): Error {
        const status = error?.response?.status;

        if (status === 401 || status === 403) {
            return new Error(`Droppoint authentication failed (${status})`);
        }
        if (status === 404) {
            return new Error('Droppoint resource not found');
        }
        if (status >= 500) {
            const err = new Error(`Droppoint service error (${status}): ${error.message}`);
            (err as any).name = 'DroppointTemporalError';
            return err;
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            const err = new Error(`Droppoint timeout: ${error.message}`);
            (err as any).name = 'DroppointTemporalError';
            return err;
        }

        return error;
    }
}
