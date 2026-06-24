import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { RequestPriority, RequestType, STATUS } from 'src/common';
import { SnowRequestService } from 'src/snow-requests/services/snow-request.service';
import { ServiceNowClientService } from 'src/servicenow/client/servicenow-client.service';
import { NagiosNotificationType, NagiosStateType, ThrukAlertDto } from './dto/thruk-alert.dto';

export type MonitoringAction =
    | 'QUEUED'         // nueva alerta encolada
    | 'DEDUPLICATED'   // alerta activa ya existe para ese host/servicio
    | 'CANCELLED'      // recovery canceló un ticket QUEUED (nunca llegó a SN)
    | 'TOO_LATE'       // recovery llegó mientras el ticket estaba IN_PROGRESS
    | 'RESOLVED_IN_SN' // recovery resolvió un ticket ya en SN — Thruk debe cerrarlo allá
    | 'IGNORED';       // notificación que no genera acción

export interface MonitoringResult {
    action: MonitoringAction;
    correlationId?: string;
    internalNumber?: string;
    reason: string;
    existingStatus?: STATUS;
    /** Solo presente en RESOLVED_IN_SN: el sys_id del ticket en ServiceNow */
    sysId?: string;
    /** Solo presente en RESOLVED_IN_SN: el número del ticket en ServiceNow */
    snowNumber?: string;
}

/**
 * Capa de decisión para alertas de monitoreo provenientes de Nagios vía Thruk.
 *
 * Decisiones aplicadas sobre cada notificación entrante:
 *
 *   IGNORADAS (nunca generan ticket):
 *     - ACKNOWLEDGEMENT   → alguien ya está atendiendo el problema manualmente
 *     - FLAPPINGSTART/STOP → servicio inestable, no es un incidente real
 *     - DOWNTIMESTART/END  → ventana de mantenimiento programada
 *     - PROBLEM con stateType=SOFT → falla no confirmada, aún en re-chequeo
 *
 *   RECOVERY → cancela el ticket pendiente por fingerprint (si todavía está QUEUED)
 *
 *   PROBLEM HARD → crea ticket con deduplicación y TTL opcional
 */
@Injectable()
export class MonitoringService {
    private readonly logger = new Logger(MonitoringService.name);

    constructor(
        private readonly snowRequestService: SnowRequestService,
        private readonly snowClient: ServiceNowClientService,
    ) { }

    /**
     * Maneja una alerta de monitoreo proveniente de Nagios vía Thruk
     * @param dto Datos de la alerta
     * @returns Resultado del manejo de la alerta
     * @example
     * ```typescript
     * const result = await this.monitoringService.handleAlert(dto);
     * ```
     * @description This method handles a Thruk alert from Nagios. 
     * It first checks if the alert should be ignored based on the notification type and state.
     * If not ignored, it checks if it's a RECOVERY alert and handles it accordingly.
     * Otherwise, it handles it as a PROBLEM alert.
     */
    async handleAlert(dto: ThrukAlertDto): Promise<MonitoringResult> {
        const fingerprint = this.buildFingerprint(dto);

        // ── Notificaciones que no generan ninguna acción ──────────────────
        const ignoreReason = this.getIgnoreReason(dto);
        if (ignoreReason) {
            this.logger.debug(`[IGNORED] fingerprint=${fingerprint} reason=${ignoreReason}`);
            return { action: 'IGNORED', reason: ignoreReason };
        }

        // ── Recovery: intentar cancelar el ticket pendiente ───────────────
        if (dto.notificationType === NagiosNotificationType.RECOVERY) {
            return this.handleRecovery(fingerprint, dto);
        }

        // ── PROBLEM HARD: crear ticket con deduplicación ──────────────────
        return this.handleProblem(fingerprint, dto);
    }

    /**
     * Cancela un ticket pendiente por fingerprint
     * @param fingerprint Huella digital de la alerta
     * @returns Resultado del manejo de la alerta
     * @example
     * ```typescript
     * const result = await this.monitoringService.cancelByFingerprint(fingerprint);
     * ```
     * @description This method handles a RECOVERY alert from Nagios via Thruk. 
     * It first checks if there is an existing active record for the fingerprint.
     * If an existing record is found, it returns a CANCELLED result.
     * If no existing record is found, it returns a TOO_LATE result.
     */
    async cancelByFingerprint(fingerprint: string): Promise<MonitoringResult> {
        return this.handleRecovery(fingerprint, null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Privados
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Maneja una alerta de tipo PROBLEM
     * @example
     * ```typescript
     * const result = await this.monitoringService.handleProblem(fingerprint, dto);
     * ```
     * @param fingerprint Huella digital de la alerta
     * @param dto Datos de la alerta
     * @returns Resultado del manejo de la alerta
     * @description This method handles a PROBLEM alert from Nagios via Thruk. 
     * It first checks if there is an existing active record for the fingerprint.
     * If an existing record is found, it returns a DEDUPLICATED result.
     * If no existing record is found, it creates a new record with the given fingerprint and other details.
     */
    private async handleProblem(fingerprint: string, dto: ThrukAlertDto): Promise<MonitoringResult> {
        // Deduplicación: ¿ya existe un registro activo para este host/servicio?
        const existing = await this.snowRequestService.findActiveByFingerprint(fingerprint);
        if (existing) {
            const fp = fingerprint.substring(0, 12);
            this.logger.log(`[DEDUPLICATED] fingerprint=${fp}... host=${dto.host} service=${dto.service ?? 'HOST'} correlationId=${existing.correlationId} status=${existing.status}`);
            return {
                action: 'DEDUPLICATED',
                correlationId: existing.correlationId,
                internalNumber: existing.internalNumber,
                reason: `Alerta activa ya existe para ${dto.host}/${dto.service ?? 'HOST'}`,
                existingStatus: existing.status,
            };
        }

        // Crear nuevo registro
        const correlationId = randomUUID();
        const internalNumber = `MON-${correlationId.substring(0, 8).toUpperCase()}`;
        const priority = this.mapPriority(dto.state);
        const expiresAt = dto.ttlSeconds ? new Date(Date.now() + dto.ttlSeconds * 1000) : null;

        await this.snowRequestService.create({
            correlationId,
            internalNumber,
            type: RequestType.INCIDENT,
            priority,
            payload: this.buildPayload(dto),
            source: 'nagios-thruk',
            immediate: false,
            status: STATUS.QUEUED,
            fingerprint,
            expiresAt,
        });

        this.logger.log(`[QUEUED] fingerprint=${fingerprint.substring(0, 12)}... host=${dto.host} service=${dto.service ?? 'HOST'} correlationId=${correlationId} priority=${priority} ttl=${dto.ttlSeconds ?? 'none'}`);
        return {
            action: 'QUEUED',
            correlationId,
            internalNumber,
            reason: `Alerta encolada [${dto.host}/${dto.service ?? 'HOST'}]`,
        };
    }

    private async handleRecovery(fingerprint: string, dto: ThrukAlertDto | null): Promise<MonitoringResult> {
        const result = await this.snowRequestService.cancelByFingerprint(fingerprint);

        if (!result) {
            const reason = 'No hay ticket activo con ese fingerprint — posiblemente ya procesado o nunca creado';
            this.logger.debug(`[RECOVERY/NOT_FOUND] fingerprint=${fingerprint}`);
            return { action: 'IGNORED', reason };
        }

        if (result.action === 'CANCELLED') {
            this.logger.log(`[CANCELLED] fingerprint=${fingerprint} correlationId=${result.entity.correlationId}`);
            return {
                action: 'CANCELLED',
                correlationId: result.entity.correlationId,
                internalNumber: result.entity.internalNumber,
                reason: 'Ticket cancelado — servicio recuperado antes de llegar a ServiceNow',
            };
        }

        if (result.action === 'RESOLVED') {
            this.logger.log(`[RESOLVED_IN_SN] fingerprint=${fingerprint} correlationId=${result.entity.correlationId} sysId=${result.entity.sysId} snowNumber=${result.entity.snowNumber}`);

            // Cerrar el ticket en ServiceNow (o simulador) vía PATCH
            if (result.entity.sysId) {
                try {
                    await this.snowClient.patchToServiceNow(
                        result.entity.type,
                        result.entity.sysId,
                        { state: 'resolved', close_notes: `Recovery automático desde Nagios — host recuperado` },
                    );
                } catch (err) {
                    // No bloquea el flujo — el recovery local ya fue registrado
                    this.logger.warn(`[RESOLVED_IN_SN] Error al cerrar ticket en SN: ${err?.message}`);
                }
            }

            return {
                action: 'RESOLVED_IN_SN',
                correlationId: result.entity.correlationId,
                internalNumber: result.entity.internalNumber,
                reason: 'Ticket resuelto en ServiceNow — el incidente puede cerrarse en Thruk',
                sysId: result.entity.sysId,
                snowNumber: result.entity.snowNumber,
            };
        }

        // action === 'TOO_LATE': está IN_PROGRESS, ya se está enviando a SN
        this.logger.warn(`[TOO_LATE] fingerprint=${fingerprint} correlationId=${result.entity.correlationId} — ya está siendo enviado a SN`);
        return {
            action: 'TOO_LATE',
            correlationId: result.entity.correlationId,
            internalNumber: result.entity.internalNumber,
            reason: 'El ticket ya está siendo enviado a ServiceNow — cancelación no posible',
            existingStatus: result.entity.status,
        };
    }

    /**
     * Calcula el fingerprint como SHA-256 del par host/servicio.
     *
     * No incluye el state para que distintas transiciones del mismo objeto
     * (WARNING → CRITICAL) se consideren el mismo incidente y no generen
     * tickets duplicados.
     *
     * Consistente con la estrategia de hash del camino estándar
     * (SnowRequestProcessingService), aunque los campos de entrada difieren.
     */
    private buildFingerprint(dto: ThrukAlertDto): string {
        const service = dto.service ?? 'HOST';
        return createHash('sha256')
            .update(JSON.stringify({ host: dto.host, service }))
            .digest('hex')
            .substring(0, 64);
    }

    /**
     * Retorna la razón por la que la notificación debe ignorarse, o null si debe procesarse.
     */
    private getIgnoreReason(dto: ThrukAlertDto): string | null {
        const ignored: NagiosNotificationType[] = [
            NagiosNotificationType.ACKNOWLEDGEMENT,
            NagiosNotificationType.FLAPPINGSTART,
            NagiosNotificationType.FLAPPINGSTOP,
            NagiosNotificationType.DOWNTIMESTART,
            NagiosNotificationType.DOWNTIMEEND,
        ];

        if (ignored.includes(dto.notificationType)) {
            return `Tipo de notificación no genera ticket: ${dto.notificationType}`;
        }

        if (dto.notificationType === NagiosNotificationType.PROBLEM && dto.stateType === NagiosStateType.SOFT) {
            return `Estado SOFT (intento ${dto.checkAttempt}/${dto.maxCheckAttempts}) — falla no confirmada`;
        }

        return null;
    }

    /**
     * Mapea el state de Nagios a prioridad de ServiceNow.
     * DOWN/UNREACHABLE/CRITICAL → CRITICAL
     * WARNING                   → HIGH
     * UNKNOWN                   → MEDIUM
     */
    private mapPriority(state: string): RequestPriority {
        const normalized = state.toUpperCase();
        if (['DOWN', 'UNREACHABLE', 'CRITICAL'].includes(normalized)) return RequestPriority.CRITICAL;
        if (normalized === 'WARNING') return RequestPriority.HIGH;
        return RequestPriority.MEDIUM;
    }

    private buildPayload(dto: ThrukAlertDto): Record<string, unknown> {
        return {
            short_description: `[${dto.state}] ${dto.host} - ${dto.service ?? 'HOST'}`,
            description: dto.output,
            host: dto.host,
            service: dto.service ?? 'HOST',
            state: dto.state,
            check_attempt: dto.checkAttempt,
            max_check_attempts: dto.maxCheckAttempts,
        };
    }
}
