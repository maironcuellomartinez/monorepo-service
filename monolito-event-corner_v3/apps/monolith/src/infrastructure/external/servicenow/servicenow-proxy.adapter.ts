// infrastructure/external/servicenow/servicenow-proxy.adapter.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Result } from '@app/result';
import { CorrelationIdService } from '@app/observability';
import {
    IServiceNowClient,
    ServiceNowIncidentPayload,
    ServiceNowRequestPayload,
    ServiceNowTicketResult,
    SnowqCorrelationResult,
    SnowqStatusResult,
} from '../../../core/ports/outgoing/servicenow/servicenow-client.port';

/**
 * Adaptador que delega las operaciones de ServiceNow al API Gateway.
 * El API Gateway actúa como único punto de salida (egress) hacia ServiceNow
 * a través de /outbound/servicenow/*.
 *
 * Variable de entorno requerida:
 *   API_GATEWAY_URL   Base URL del API Gateway (ej: http://localhost:3000)
 */
@Injectable()
export class ServiceNowProxyAdapter implements IServiceNowClient {
    private readonly logger = new Logger(ServiceNowProxyAdapter.name);
    private readonly baseUrl: string;
    private readonly m2mToken: string;

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
        private readonly correlation: CorrelationIdService,
    ) {
        const gatewayUrl = this.config.get<string>('API_GATEWAY_URL', 'http://localhost:3000');
        this.baseUrl = `${gatewayUrl}/outbound/servicenow`;
        this.m2mToken = this.config.get<string>('ABAC_M2M_TOKEN', '');
    }

    private get headers(): Record<string, string> {
        const cid = this.correlation.getCorrelationId();
        return {
            'Authorization': `Bearer ${this.m2mToken}`,
            ...(cid ? { 'x-correlation-id': cid } : {}),
        };
    }

    async createIncident(payload: ServiceNowIncidentPayload): Promise<Result<ServiceNowTicketResult>> {
        try {
            const { data } = await firstValueFrom(
                this.http.post<ServiceNowTicketResult>(`${this.baseUrl}/incidents`, payload, { headers: this.headers }),
            );
            return Result.ok(data);
        } catch (err) {
            return this.handleError('createIncident', err);
        }
    }

    async createRequest(payload: ServiceNowRequestPayload): Promise<Result<ServiceNowTicketResult>> {
        try {
            const { data } = await firstValueFrom(
                this.http.post<ServiceNowTicketResult>(`${this.baseUrl}/requests`, payload, { headers: this.headers }),
            );
            return Result.ok(data);
        } catch (err) {
            return this.handleError('createRequest', err);
        }
    }

    async enqueueIncident(payload: ServiceNowIncidentPayload): Promise<Result<SnowqCorrelationResult>> {
        try {
            const { data } = await firstValueFrom(
                this.http.post<SnowqCorrelationResult>(`${this.baseUrl}/incidents/enqueue`, payload, { headers: this.headers }),
            );
            return Result.ok(data);
        } catch (err) {
            return this.handleError('enqueueIncident', err);
        }
    }

    async enqueueRequest(payload: ServiceNowRequestPayload): Promise<Result<SnowqCorrelationResult>> {
        try {
            const { data } = await firstValueFrom(
                this.http.post<SnowqCorrelationResult>(`${this.baseUrl}/requests/enqueue`, payload, { headers: this.headers }),
            );
            return Result.ok(data);
        } catch (err) {
            return this.handleError('enqueueRequest', err);
        }
    }

    async getReconcileStatus(correlationId: string): Promise<Result<SnowqStatusResult | null>> {
        try {
            const { data } = await firstValueFrom(
                this.http.get<SnowqStatusResult | null>(`${this.baseUrl}/reconcile/${correlationId}`, { headers: this.headers }),
            );
            return Result.ok(data ?? null);
        } catch (err: any) {
            if (err?.response?.status === 404) return Result.ok(null);
            return this.handleError('getReconcileStatus', err);
        }
    }

    async retrySnowqEntry(correlationId: string): Promise<Result<void>> {
        try {
            await firstValueFrom(
                this.http.post(`${this.baseUrl}/reconcile/${correlationId}/retry`, {}, { headers: this.headers }),
            );
            return Result.ok(undefined);
        } catch (err) {
            return this.handleError('retrySnowqEntry', err);
        }
    }

    async updateTicket(table: string, sysId: string, fields: Record<string, any>): Promise<Result<void>> {
        try {
            await firstValueFrom(
                this.http.patch(`${this.baseUrl}/${table}/${sysId}`, fields, { headers: this.headers }),
            );
            return Result.ok(undefined);
        } catch (err) {
            return this.handleError('updateTicket', err);
        }
    }

    async closeIncident(sysId: string, closeCategory: string, closeNotes = 'Cerrado desde Event Corner'): Promise<Result<void>> {
        try {
            await firstValueFrom(
                this.http.post(`${this.baseUrl}/incidents/${sysId}/close`, { closeCategory, closeNotes }, { headers: this.headers }),
            );
            return Result.ok(undefined);
        } catch (err) {
            return this.handleError('closeIncident', err);
        }
    }

    async queryIncidentState(sysId: string): Promise<Result<string | null>> {
        try {
            const { data } = await firstValueFrom(
                this.http.get<{ state: string }>(`${this.baseUrl}/incidents/${sysId}/state`, { headers: this.headers }),
            );
            return Result.ok(data?.state ?? null);
        } catch (err: any) {
            if (err?.response?.status === 404) return Result.ok(null);
            return this.handleError('queryIncidentState', err);
        }
    }

    private handleError(method: string, err: unknown): Result<never> {
        const axiosErr = err as any;
        const status: number | undefined = axiosErr?.response?.status;
        const gwMessage: string | undefined = axiosErr?.response?.data?.message ?? axiosErr?.response?.data?.error;
        const message = gwMessage
            ? `ServiceNow proxy [${status}] on ${method}: ${gwMessage}`
            : `ServiceNow proxy ${method} failed: ${axiosErr?.message ?? String(err)}`;
        this.logger.error(message);
        return Result.err(new Error(message));
    }
}
