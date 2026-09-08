// src/droppoint/droppoint.connector.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TracingService } from '../observability/tracing.service';

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
export class DroppointConnector {
    private readonly logger = new Logger(DroppointConnector.name);
    private readonly baseUrl: string;
    private readonly authHeader: string;
    private readonly timeout: number;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        private readonly tracing: TracingService,
    ) {
        this.baseUrl = configService.get<string>(
            'droppoint.baseUrl',
            'https://inetum.drop-point.com/company_api/v5',
        );
        this.timeout = configService.get<number>('droppoint.timeout', 10000);

        const username = configService.get<string>('droppoint.username', '');
        const password = configService.get<string>('droppoint.password', '');
        this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
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
        return this.tracing.run('integration.connector.droppoint.createShipment', { kind: 'client' }, () => this._createShipment(request));
    }

    private async _createShipment(request: CreateShipmentRequest): Promise<DroppointShipment> {
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
        return this.tracing.run('integration.connector.droppoint.updateShipmentState', { kind: 'client' }, () => this._updateShipmentState(request));
    }

    private async _updateShipmentState(request: UpdateShipmentRequest): Promise<DroppointShipment> {
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
        return this.tracing.run('integration.connector.droppoint.cancelShipment', { kind: 'client', attributes: { 'droppoint.externalId': externalId } }, () => this._cancelShipment(externalId, machineRef));
    }

    private async _cancelShipment(externalId: string, machineRef: string): Promise<void> {
        await this._updateShipmentState({
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
