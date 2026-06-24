import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { BaseSnowRequestDto, RequestType, ServiceNowTemporalError, STATUS } from 'src/common';
import { SnowRequestService } from './snow-request.service';
import { SnowRequestQueueService } from './snow-request-queue.service';
import { ServiceNowClientService } from 'src/servicenow/client/servicenow-client.service';

export interface EnqueueResult {
    correlationId: string;
    internalNumber: string;
    deduplicated: boolean;
}

@Injectable()
export class SnowRequestProcessingService {
    private readonly logger = new Logger(SnowRequestProcessingService.name);

    constructor(
        private readonly snowRequestService: SnowRequestService,
        private readonly queueService: SnowRequestQueueService,
        private readonly snClient: ServiceNowClientService,
    ) { }

    // =====================
    // MODO ASÍNCRONO
    // =====================

    /**
     * Persiste la solicitud en DB con status=QUEUED.
     *
     * Antes de crear, calcula un fingerprint (hash SHA-256) a partir de campos
     * de identidad del payload. Si ya existe un registro activo con el mismo
     * fingerprint (QUEUED o IN_PROGRESS), devuelve el correlationId existente
     * sin crear un duplicado — idempotencia automática para cualquier fuente.
     *
     * Campos de identidad reconocidos en el payload (en orden de precedencia):
     *   incidentId · requestId · externalId · entityId · id
     *
     * Si ninguno está presente, no se aplica deduplicación (se crea siempre).
     */
    async enqueue(type: RequestType, dto: BaseSnowRequestDto): Promise<EnqueueResult> {
        const fingerprint = this.computeFingerprint(type, dto.source, dto.payload);

        if (fingerprint) {
            const existing = await this.snowRequestService.findActiveByFingerprint(fingerprint);
            if (existing) {
                this.logger.log(
                    `Deduplicado → ${existing.internalNumber} [tipo=${type} source=${dto.source} fingerprint=${fingerprint.substring(0, 12)}...]`,
                );
                return { correlationId: existing.correlationId, internalNumber: existing.internalNumber, deduplicated: true };
            }
        }

        const correlationId = randomUUID();
        const internalNumber = `SNQ-${correlationId.substring(0, 8).toUpperCase()}`;

        await this.snowRequestService.create({
            correlationId,
            internalNumber,
            type,
            priority: dto.priority,
            payload: dto.payload,
            source: dto.source,
            immediate: false,
            status: STATUS.QUEUED,
            fingerprint: fingerprint ?? null,
            expiresAt: null,
        });

        this.logger.log(`Encolado → ${internalNumber} [tipo=${type} prioridad=${dto.priority} fingerprint=${fingerprint ? fingerprint.substring(0, 12) + '...' : 'none'}]`, 'SnowRequestProcessingService');

        return { correlationId, internalNumber, deduplicated: false };
    }

    // =====================
    // MODO INMEDIATO
    // =====================

    /**
     * Procesa la solicitud de forma sincrónica — no pasa por la cola.
     * No aplica deduplicación: el modo inmediato es intencional y fire-once.
     */
    async processImmediate(type: RequestType, dto: BaseSnowRequestDto): Promise<{ sys_id: string; snowNumber: string }> {
        const correlationId = randomUUID();
        const internalNumber = `SNQ-${correlationId.substring(0, 8).toUpperCase()}`;

        const entity = await this.snowRequestService.create({
            correlationId,
            internalNumber,
            type,
            priority: dto.priority,
            payload: dto.payload,
            source: dto.source,
            immediate: true,
            status: STATUS.IN_PROGRESS,
            fingerprint: null,
            expiresAt: null,
        });

        // Un único reintento rápido ante errores transitorios (blips de red, SN sobrecargado).
        // Los errores fatales (4xx) y de auth se propagan directamente sin reintentar.
        let lastError: any;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 500));
            try {
                const result = await this.queueService.sendToServiceNow(entity);
                await this.snowRequestService.markAsDelivered(correlationId, result.sys_id, result.snowNumber);
                return { sys_id: result.sys_id, snowNumber: result.snowNumber };
            } catch (error) {
                if (error instanceof ServiceNowTemporalError) {
                    lastError = error;
                    continue;
                }
                await this.snowRequestService.markAsFailed(correlationId, error?.message);
                throw error;
            }
        }
        await this.snowRequestService.markAsFailed(correlationId, lastError?.message);
        throw lastError;
    }

    // =====================
    // OPERACIONES DIRECTAS
    // =====================

    /**
     * Cierra un incident en ServiceNow (state=6, Resolved).
     * Llamado desde el monolith cuando el incidente se cierra en negocio.
     */
    async closeIncident(sysId: string, closeCode: string, closeNotes: string): Promise<void> {
        await this.snClient.patchToServiceNow(RequestType.INCIDENT, sysId, {
            state: '6',
            close_code: closeCode,
            close_notes: closeNotes,
        });
        this.logger.log(`Incident cerrado en SN | sysId=${sysId} | closeCode=${closeCode}`);
    }

    /**
     * Consulta el estado actual de un incident en ServiceNow.
     * Retorna null si el ticket no existe (404).
     */
    async getIncidentState(sysId: string): Promise<{ state: string; closed: boolean } | null> {
        return this.snClient.getTicketState(RequestType.INCIDENT, sysId);
    }

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Calcula un fingerprint SHA-256 a partir de campos de identidad del payload.
     *
     * El hash incluye type + source + id para que el mismo ID de negocio en
     * diferentes fuentes o tipos no colisione.
     *
     * Devuelve null si no se encuentra ningún campo de identidad conocido:
     * en ese caso la deduplicación no aplica y se crea el registro siempre.
     */
    private computeFingerprint(
        type: RequestType,
        source: string,
        payload: Record<string, unknown>,
    ): string | null {
        const identity =
            payload.incidentId ??
            payload.requestId ??
            payload.externalId ??
            payload.entityId ??
            payload.id;

        if (!identity) return null;

        return createHash('sha256')
            .update(JSON.stringify({ type, source, id: String(identity) }))
            .digest('hex')
            .substring(0, 64);
    }
}
