// core/ports/outgoing/servicenow/servicenow-client.port.ts
import { Result } from '@app/result';

export interface ServiceNowIncidentPayload {
  company: string | null;
  category: string;
  assignment_group: string;
  location: string;
  short_description: string;
  description: string;
  caller_id: string;
  /** Urgencia SN (1–3) — proviene del IssueType. */
  urgency: number;
  /** Impacto SN (1–3) — proviene del IssueType. */
  impact: number;
  /** Severidad SN (critical|high|medium|low, mapeada a `u_severity`) — proviene del IssueType. */
  severity: string;
  expected_start?: Date;
  /** ID del incident en el monolito — usado por snowq para deduplicar reintentos/re-encolados. */
  externalId?: string;
  /** SN exige assigned_to al crear el ticket — se usa un técnico por default (SN_DEFAULT_TECHNICIAN); se reasigna al técnico real al tomar la incidencia. */
  assigned_to?: string;
}

export interface ServiceNowRequestPayload {
  company: string | null;
  category: string;
  assignment_group: string;
  location: string;
  short_description: string;
  description: string;
  caller_id: string;
  requested_for?: string;
  /** ID del request en el monolito — usado por snowq para deduplicar reintentos/re-encolados. */
  externalId?: string;
}

export interface ServiceNowTicketResult {
  sysId: string;
  number: string;
  /** Presente cuando snowq pone el ticket en cola asíncrona (modo deferred) */
  deferred?: boolean;
  /** ID de correlación interno de snowq para el modo async (≠ x-correlation-id HTTP) */
  correlationId?: string;
}

export interface SnowqCorrelationResult {
  correlationId: string;
  internalNumber: string;
}

export interface SnowqStatusResult {
  correlationId: string;
  status:
    | 'IN_PROGRESS'
    | 'QUEUED'
    | 'DELIVERED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED';
  sysId?: string;
  snowNumber?: string;
  lastError?: string | null;
  retryCount?: number;
  maxRetries?: number;
}

export interface IServiceNowClient {
  /** Crea un ticket de tipo Incident en ServiceNow (dos fases: inmediato → cola async) */
  createIncident(
    payload: ServiceNowIncidentPayload,
  ): Promise<Result<ServiceNowTicketResult>>;

  /** Crea un ticket de tipo Request (sc_req_item) en ServiceNow (dos fases: inmediato → cola async) */
  createRequest(
    payload: ServiceNowRequestPayload,
  ): Promise<Result<ServiceNowTicketResult>>;

  /**
   * Encola un incident en snowq sin intentar creación inmediata.
   * Usar para recuperación de incidencias huérfanas — el reconciler se encarga
   * de obtener sysId + number cuando snowq lo procese.
   */
  enqueueIncident(
    payload: ServiceNowIncidentPayload,
  ): Promise<Result<SnowqCorrelationResult>>;

  /**
   * Encola una request en snowq sin intentar creación inmediata.
   */
  enqueueRequest(
    payload: ServiceNowRequestPayload,
  ): Promise<Result<SnowqCorrelationResult>>;

  /**
   * Consulta el estado de un correlationId en snowq.
   * Retorna null si el correlationId no existe (404).
   */
  getReconcileStatus(
    correlationId: string,
  ): Promise<Result<SnowqStatusResult | null>>;

  /**
   * Reintenta una entrada FAILED en snowq (resetea retryCount=0 → QUEUED).
   * Mantiene el mismo correlationId — el reconciler sigue monitoreando el mismo entry.
   */
  retrySnowqEntry(correlationId: string): Promise<Result<void>>;

  /** Actualiza campos arbitrarios de un ticket */
  updateTicket(
    table: string,
    sysId: string,
    fields: Record<string, any>,
  ): Promise<Result<void>>;

  /** Cierra un ticket de incident con categoría y notas de cierre */
  closeIncident(
    sysId: string,
    closeCategory: string,
    closeNotes?: string,
  ): Promise<Result<void>>;

  /** Consulta el estado actual de un incident en ServiceNow. Retorna el state code ('1','2','6','7') o null si no existe. */
  queryIncidentState(sysId: string): Promise<Result<string | null>>;

  /** Lista el catálogo de empresas de ServiceNow (usado por SnCompanySyncJob) */
  getCompanies(): Promise<Result<Array<{ sys_id: string; name: string }>>>;
}
