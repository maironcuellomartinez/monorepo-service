import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import {
  retry,
  FixedBackoff,
  type RetryErrorPayload,
} from '@backendkit-labs/retry';
import {
  BaseSnowRequestDto,
  RequestType,
  ServiceNowTemporalError,
  STATUS,
} from 'src/common';
import { SnowRequestService } from './snow-request.service';
import { SnowRequestQueueService } from './snow-request-queue.service';
import { ServiceNowClientService } from 'src/servicenow/client/servicenow-client.service';
import { TracingClient } from '../../common/tracing.client';
import { CorrelationIdService } from 'src/common';

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
    private readonly correlationIdService: CorrelationIdService,
  ) {}

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
  async enqueue(
    type: RequestType,
    dto: BaseSnowRequestDto,
  ): Promise<EnqueueResult> {
    return TracingClient.getInstance().run(
      'snowq.service.snowRequestProcessing.enqueue',
      {
        kind: 'internal',
        attributes: { 'sn.type': type },
        correlationId: this.correlationIdService.getCorrelationId(),
      },
      () => this._enqueue(type, dto),
    );
  }

  private async _enqueue(
    type: RequestType,
    dto: BaseSnowRequestDto,
  ): Promise<EnqueueResult> {
    const fingerprint = this.computeFingerprint(type, dto.source, dto.payload);

    if (fingerprint) {
      const existing =
        await this.snowRequestService.findActiveByFingerprint(fingerprint);
      if (existing) {
        this.logger.log(
          `Deduplicado → ${existing.internalNumber} [tipo=${type} source=${dto.source} fingerprint=${fingerprint.substring(0, 12)}...]`,
        );
        return {
          correlationId: existing.correlationId,
          internalNumber: existing.internalNumber,
          deduplicated: true,
        };
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

    this.logger.log(
      `Encolado → ${internalNumber} [tipo=${type} prioridad=${dto.priority} fingerprint=${fingerprint ? fingerprint.substring(0, 12) + '...' : 'none'}]`,
    );

    return { correlationId, internalNumber, deduplicated: false };
  }

  // =====================
  // MODO INMEDIATO
  // =====================

  /**
   * Procesa la solicitud de forma sincrónica — no pasa por la cola.
   * No aplica deduplicación: el modo inmediato es intencional y fire-once.
   *
   * Usa @backendkit-labs/retry con FixedBackoff(500ms) para hasta 2 intentos.
   * Solo reintenta en ServiceNowTemporalError (5xx, 408, 429).
   * Errores fatales (4xx) y de auth abortan de inmediato.
   */
  async processImmediate(
    type: RequestType,
    dto: BaseSnowRequestDto,
  ): Promise<{ sys_id: string; snowNumber: string }> {
    return TracingClient.getInstance().run(
      'snowq.service.snowRequestProcessing.processImmediate',
      {
        kind: 'internal',
        attributes: { 'sn.type': type },
        correlationId: this.correlationIdService.getCorrelationId(),
      },
      () => this._processImmediate(type, dto),
    );
  }

  private async _processImmediate(
    type: RequestType,
    dto: BaseSnowRequestDto,
  ): Promise<{ sys_id: string; snowNumber: string }> {
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

    const result = await retry(
      () => this.queueService.sendToServiceNow(entity),
      {
        maxAttempts: 2,
        backoff: new FixedBackoff({ baseDelay: 500 }),
        abortIf: (payload: RetryErrorPayload) =>
          !(payload.cause instanceof ServiceNowTemporalError),
      },
    );

    if (result.ok) {
      await this.snowRequestService.markAsDelivered(
        correlationId,
        result.value.sys_id,
        result.value.snowNumber,
      );
      return result.value;
    }

    const cause =
      result.error.cause instanceof Error ? result.error.cause : undefined;
    await this.snowRequestService.markAsFailed(
      correlationId,
      cause?.message ?? result.error.message,
    );
    throw cause ?? new Error(result.error.message);
  }

  // =====================
  // OPERACIONES DIRECTAS
  // =====================

  /**
   * Cierra un incident en ServiceNow (state=6, Resolved).
   * Llamado desde el monolith cuando el incidente se cierra en negocio.
   */
  async closeIncident(
    sysId: string,
    closeCode: string,
    closeNotes: string,
  ): Promise<void> {
    return TracingClient.getInstance().run(
      'snowq.service.snowRequestProcessing.closeIncident',
      {
        kind: 'internal',
        attributes: { 'sn.sysId': sysId },
        correlationId: this.correlationIdService.getCorrelationId(),
      },
      () => this._closeIncident(sysId, closeCode, closeNotes),
    );
  }

  private async _closeIncident(
    sysId: string,
    closeCode: string,
    closeNotes: string,
  ): Promise<void> {
    await this.snClient.patchToServiceNow(RequestType.INCIDENT, sysId, {
      state: '6',
      close_code: closeCode,
      close_notes: closeNotes,
    });
    this.logger.log(
      `Incident cerrado en SN | sysId=${sysId} | closeCode=${closeCode}`,
    );
  }

  /**
   * Actualiza campos arbitrarios de un ticket en ServiceNow (ej. reabrir un incident).
   * Único punto de entrada para PATCHes genéricos — todo consumidor (gateway, jobs) pasa por acá.
   */
  async updateTicket(
    type: RequestType,
    sysId: string,
    fields: Record<string, any>,
  ): Promise<void> {
    return TracingClient.getInstance().run(
      'snowq.service.snowRequestProcessing.updateTicket',
      {
        kind: 'internal',
        attributes: { 'sn.sysId': sysId, 'sn.type': type },
        correlationId: this.correlationIdService.getCorrelationId(),
      },
      () => this._updateTicket(type, sysId, fields),
    );
  }

  private async _updateTicket(
    type: RequestType,
    sysId: string,
    fields: Record<string, any>,
  ): Promise<void> {
    await this.snClient.patchToServiceNow(type, sysId, fields);
    this.logger.log(
      `Ticket actualizado en SN | type=${type} | sysId=${sysId} | fields=${Object.keys(fields).join(',')}`,
    );
  }

  /**
   * Consulta el estado actual de un incident en ServiceNow.
   * Retorna null si el ticket no existe (404).
   */
  async getIncidentState(
    sysId: string,
  ): Promise<{ state: string; closed: boolean } | null> {
    return this.snClient.getTicketState(RequestType.INCIDENT, sysId);
  }

  /**
   * Lista el catálogo de empresas de ServiceNow (usado por SnCompanySyncJob del monolito).
   */
  async getCompanies(): Promise<Array<{ sys_id: string; name: string }>> {
    return this.snClient.getCompanies();
  }

  /** Consulta una empresa por sys_id. Retorna null si no existe. */
  async getCompanyBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string } | null> {
    return this.snClient.getCompanyBySysId(sysId);
  }

  /** Lista el catálogo de grupos de asignación de ServiceNow (usado por api-gateway). */
  async getLocations(): Promise<Array<{ sys_id: string; name: string }>> {
    return this.snClient.getLocations();
  }

  async getGroups(): Promise<Array<{ sys_id: string; name: string }>> {
    return this.snClient.getGroups();
  }

  /** Consulta un grupo de asignación por sys_id. Retorna null si no existe. */
  async getGroupBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string } | null> {
    return this.snClient.getGroupBySysId(sysId);
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
