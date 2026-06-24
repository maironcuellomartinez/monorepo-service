// src/presentation/controllers/servicenow.controller.ts
import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    HttpCode,
    HttpStatus,
    Logger,
    UseGuards,
    BadGatewayException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InternalTokenGuard } from '../../shared/guards/internal-token.guard';
import { SnowqConnector } from '../../infrastructure/external/connectors/snowq.connector';

/** Prefijo para distinguir correlationIds generados por snowq de otros IDs del sistema. */
const SNOWQ_PREFIX = 'snowq:';

export interface ServiceNowTicketResult {
    sysId: string;
    number: string;
    deferred: boolean;
    correlationId?: string;
}

/**
 * Expone operaciones de ServiceNow hacia el api-gateway.
 * El api-gateway actúa como proxy: monolito → gateway → integration-service → api-snowq-service → SN.
 *
 * Creación de tickets: dos fases vía SnowqConnector
 *   1. INMEDIATO  — respuesta síncrona con sys_id + snowNumber
 *   2. ASYNC      — fallback a cola del broker (deferred=true)
 *
 * Actualizaciones/cierre/consulta de estado: llamada directa al simulador SN
 *   (api-snowq-service no expone esos endpoints).
 *
 * Variables de entorno (integration-service):
 *   SNOWQ_BASE_URL              Base URL de api-snowq-service  (default: http://localhost:3090)
 *   SERVICENOW_BASE_URL         Base URL del simulador/SN real  (default: http://localhost:3010)
 */
@ApiTags('ServiceNow')
@ApiBearerAuth()
@Controller('servicenow')
@UseGuards(InternalTokenGuard)
export class ServiceNowController {
    private readonly logger = new Logger(ServiceNowController.name);

    constructor(
        private readonly snowq: SnowqConnector,
        private readonly httpService: HttpService,
        private readonly config: ConfigService,
    ) { }

    private get simulatorUrl(): string {
        return this.config.get<string>('SERVICENOW_BASE_URL', 'http://localhost:3010');
    }

    /** Agrega el prefijo 'snowq:' para distinguir correlationIds de snowq. */
    private prefixCorrelationId(correlationId: string): string {
        return `${SNOWQ_PREFIX}${correlationId}`;
    }

    /** Quita el prefijo 'snowq:' antes de llamar a snowq. */
    private stripCorrelationPrefix(prefixed: string): string {
        return prefixed.startsWith(SNOWQ_PREFIX) ? prefixed.slice(SNOWQ_PREFIX.length) : prefixed;
    }

    private buildIncidentBody(payload: Record<string, any>) {
        return {
            severity: 'medium',
            impact: 2,
            urgency: 2,
            priority: 2,
            source: 'event-corner',
            payload: {
                short_description: payload.short_description,
                description: payload.description,
                assignmentGroup: payload.assignment_group,
                caller_id: payload.caller_id,
            },
        };
    }

    private buildRequestBody(payload: Record<string, any>) {
        return {
            severity: 'low',
            impact: 1,
            urgency: 1,
            priority: 1,
            source: 'event-corner',
            payload: {
                short_description: payload.short_description,
                description: payload.description,
                assignmentGroup: payload.assignment_group,
                caller_id: payload.caller_id,
                requested_for: payload.requested_for,
            },
        };
    }

    // ── Create incident ────────────────────────────────────────────────────────

    @Post('incidents')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create ServiceNow incident (two-phase: sync → async fallback)' })
    async createIncident(@Body() payload: Record<string, any>): Promise<ServiceNowTicketResult> {
        this.logger.log(`→ createIncident | caller=${payload?.caller_id} | group=${payload?.assignment_group}`);
        const body = this.buildIncidentBody(payload);

        // Phase 1 — immediate (sync)
        try {
            const data = await this.snowq.queueImmediateIncident(body);
            const { sys_id: sysId, snowNumber: number } = data;
            if (!sysId || !number) throw new Error(`Unexpected immediate response: ${JSON.stringify(data)}`);
            this.logger.log(`← createIncident IMMEDIATE | number=${number} sysId=${sysId}`);
            return { sysId, number, deferred: false };
        } catch (immediateErr: any) {
            this.logger.warn(`createIncident: immediate failed (${immediateErr?.message}) — fallback async`);
        }

        // Phase 2 — async queue fallback
        try {
            const data = await this.snowq.queueIncident(body);
            const { correlationId, internalNumber } = data;
            if (!correlationId) throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
            const prefixed = this.prefixCorrelationId(correlationId);
            this.logger.log(`← createIncident ASYNC | correlationId=${prefixed} internalNumber=${internalNumber}`);
            return { sysId: '', number: internalNumber ?? '', deferred: true, correlationId: prefixed };
        } catch (asyncErr: any) {
            this.logger.error(`createIncident: async fallback also failed: ${asyncErr?.message}`);
            throw new BadGatewayException(`ServiceNow unavailable: ${asyncErr?.message}`);
        }
    }

    // ── Create request (service catalog) ──────────────────────────────────────

    @Post('requests')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create ServiceNow service catalog request (two-phase: sync → async fallback)' })
    async createRequest(@Body() payload: Record<string, any>): Promise<ServiceNowTicketResult> {
        this.logger.log(`→ createRequest | caller=${payload?.caller_id} | group=${payload?.assignment_group}`);
        const body = this.buildRequestBody(payload);

        // Phase 1 — immediate (sync)
        try {
            const data = await this.snowq.queueImmediateRequest(body);
            const { sys_id: sysId, snowNumber: number } = data;
            if (!sysId || !number) throw new Error(`Unexpected immediate response: ${JSON.stringify(data)}`);
            this.logger.log(`← createRequest IMMEDIATE | number=${number} sysId=${sysId}`);
            return { sysId, number, deferred: false };
        } catch (immediateErr: any) {
            this.logger.warn(`createRequest: immediate failed (${immediateErr?.message}) — fallback async`);
        }

        // Phase 2 — async queue fallback
        try {
            const data = await this.snowq.queueRequest(body);
            const { correlationId, internalNumber } = data;
            if (!correlationId) throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
            const prefixed = this.prefixCorrelationId(correlationId);
            this.logger.log(`← createRequest ASYNC | correlationId=${prefixed} internalNumber=${internalNumber}`);
            return { sysId: '', number: internalNumber ?? '', deferred: true, correlationId: prefixed };
        } catch (asyncErr: any) {
            this.logger.error(`createRequest: async fallback also failed: ${asyncErr?.message}`);
            throw new BadGatewayException(`ServiceNow unavailable: ${asyncErr?.message}`);
        }
    }

    // ── Update ticket ──────────────────────────────────────────────────────────

    @Patch(':table/:sysId')
    @ApiOperation({ summary: 'Update a ServiceNow ticket directly in the simulator' })
    async updateTicket(
        @Param('table') table: string,
        @Param('sysId') sysId: string,
        @Body() fields: Record<string, any>,
    ) {
        this.logger.log(`→ updateTicket | table=${table} sysId=${sysId} fields=${Object.keys(fields).join(',')}`);
        try {
            await firstValueFrom(
                this.httpService.patch(
                    `${this.simulatorUrl}/api/now/v2/${table}/${sysId}`,
                    fields,
                ),
            );
            this.logger.log(`← updateTicket OK | ${table}/${sysId}`);
            return { updated: true };
        } catch (err: any) {
            const msg = err?.response?.data?.message ?? err?.message ?? String(err);
            this.logger.error(`updateTicket failed: ${msg}`);
            throw new BadGatewayException(`ServiceNow update failed: ${msg}`);
        }
    }

    // ── Query incident state ───────────────────────────────────────────────────

    @Get('incidents/:sysId/state')
    @ApiOperation({ summary: 'Query incident state from the ServiceNow simulator' })
    async getIncidentState(@Param('sysId') sysId: string) {
        this.logger.log(`→ queryIncidentState | sysId=${sysId}`);
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.simulatorUrl}/api/now/v2/incident/${sysId}`),
            );
            const state: string | null = response.data?.result?.state ?? null;
            this.logger.log(`← queryIncidentState | sysId=${sysId} state=${state}`);
            return { state };
        } catch (err: any) {
            if (err?.response?.status === 404) return { state: null };
            const msg = err?.response?.data?.message ?? err?.message ?? String(err);
            this.logger.error(`queryIncidentState failed: ${msg}`);
            throw new BadGatewayException(`ServiceNow state query failed: ${msg}`);
        }
    }

    // ── Enqueue incident async-only (no immediate attempt) ────────────────────

    @Post('incidents/enqueue')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Queue an incident in snowq (async only — no immediate attempt)' })
    async enqueueIncident(@Body() payload: Record<string, any>): Promise<{ correlationId: string; internalNumber: string }> {
        this.logger.log(`→ enqueueIncident | caller=${payload?.caller_id}`);
        const body = this.buildIncidentBody(payload);

        try {
            const data = await this.snowq.queueIncident(body);
            if (!data.correlationId) throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
            const prefixed = this.prefixCorrelationId(data.correlationId);
            this.logger.log(`← enqueueIncident | correlationId=${prefixed} internalNumber=${data.internalNumber}`);
            return { correlationId: prefixed, internalNumber: data.internalNumber };
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            this.logger.error(`enqueueIncident failed: ${msg}`);
            throw new BadGatewayException(`ServiceNow queue unavailable: ${msg}`);
        }
    }

    // ── Enqueue request async-only ─────────────────────────────────────────────

    @Post('requests/enqueue')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Queue a service catalog request in snowq (async only — no immediate attempt)' })
    async enqueueRequest(@Body() payload: Record<string, any>): Promise<{ correlationId: string; internalNumber: string }> {
        this.logger.log(`→ enqueueRequest | caller=${payload?.caller_id}`);
        const body = this.buildRequestBody(payload);

        try {
            const data = await this.snowq.queueRequest(body);
            if (!data.correlationId) throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
            const prefixed = this.prefixCorrelationId(data.correlationId);
            this.logger.log(`← enqueueRequest | correlationId=${prefixed} internalNumber=${data.internalNumber}`);
            return { correlationId: prefixed, internalNumber: data.internalNumber };
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            this.logger.error(`enqueueRequest failed: ${msg}`);
            throw new BadGatewayException(`ServiceNow queue unavailable: ${msg}`);
        }
    }

    // ── Reconcile status (snowq correlation query) ─────────────────────────────

    @Get('reconcile/:correlationId')
    @ApiOperation({ summary: 'Query snowq status for a pending correlation ID' })
    async getReconcileStatus(@Param('correlationId') correlationId: string) {
        const rawId = this.stripCorrelationPrefix(correlationId);
        this.logger.debug(`→ getReconcileStatus | correlationId=${correlationId} → rawId=${rawId}`);
        try {
            const status = await this.snowq.getRequestStatus(rawId);
            if (!status) return null;
            return status;
        } catch (err: any) {
            if (err?.response?.status === 404) return null;
            const msg = err?.message ?? String(err);
            this.logger.error(`getReconcileStatus failed: ${msg}`);
            throw new BadGatewayException(`Snowq status query failed: ${msg}`);
        }
    }

    // ── Retry a FAILED snowq entry (keeps same correlationId) ─────────────────

    @Post('reconcile/:correlationId/retry')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Retry a FAILED snowq entry — resets retryCount and puts it back to QUEUED' })
    async retrySnowqEntry(@Param('correlationId') correlationId: string) {
        const rawId = this.stripCorrelationPrefix(correlationId);
        this.logger.log(`→ retrySnowqEntry | correlationId=${correlationId} → rawId=${rawId}`);
        try {
            await this.snowq.retryFailed(rawId);
            this.logger.log(`← retrySnowqEntry OK | correlationId=${correlationId} → back to QUEUED`);
            return { retried: true, correlationId };
        } catch (err: any) {
            if (err?.response?.status === 404) {
                throw new BadGatewayException(`correlationId not found or not in FAILED state: ${correlationId}`);
            }
            const msg = err?.message ?? String(err);
            this.logger.error(`retrySnowqEntry failed: ${msg}`);
            throw new BadGatewayException(`Snowq retry failed: ${msg}`);
        }
    }

    // ── Close incident ─────────────────────────────────────────────────────────

    @Post('incidents/:sysId/close')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Close a ServiceNow incident' })
    async closeIncident(
        @Param('sysId') sysId: string,
        @Body() body: { closeCategory: string; closeNotes?: string },
    ) {
        this.logger.log(`→ closeIncident | sysId=${sysId} | closeCategory=${body.closeCategory}`);
        try {
            await firstValueFrom(
                this.httpService.patch(
                    `${this.simulatorUrl}/api/now/v2/incident/${sysId}`,
                    {
                        state: 'resolved',
                        close_code: body.closeCategory,
                        close_notes: body.closeNotes ?? 'Cerrado desde Event Corner',
                    },
                ),
            );
            this.logger.log(`← closeIncident OK | sysId=${sysId}`);
            return { closed: true };
        } catch (err: any) {
            if (err?.response?.status === 404) {
                this.logger.warn(`closeIncident: sysId=${sysId} not found in SN, ignoring`);
                return { closed: true };
            }
            const msg = err?.response?.data?.message ?? err?.message ?? String(err);
            this.logger.error(`closeIncident failed: ${msg}`);
            throw new BadGatewayException(`ServiceNow close failed: ${msg}`);
        }
    }
}
