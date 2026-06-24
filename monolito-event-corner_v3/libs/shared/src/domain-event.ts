import { CausationId, CorrelationId } from "./types/branded-ids";

/**
 * Clase base concreta para todos los eventos de dominio del sistema.
 *
 * Uso:
 *   new DomainEvent('INCIDENT_CREATED', id, 'Incident', { issueTypeId, ... })
 *
 * - eventId    → UUID generado al crear el evento (idempotency key para el outbox)
 * - type       → nombre del evento (e.g. 'INCIDENT_CREATED')
 * - aggregateId → ID del agregado que originó el evento
 * - aggregateType → nombre del agregado (e.g. 'Incident', 'Request')
 * - data       → payload específico del evento
 * - timestamp  → momento en que ocurrió el evento
 */
export class DomainEvent {
    public readonly eventId: string;
    public readonly timestamp: Date;

    constructor(
        public readonly type: string,
        public readonly aggregateId: string,
        public readonly aggregateType: string,
        public readonly data: Record<string, any> = {},
        public readonly version: number = 1,
        public readonly correlationId?: CorrelationId,
        public readonly causationId?: CausationId,
        public readonly triggeredBy?: string,
    ) {
        this.eventId = crypto.randomUUID();
        this.timestamp = new Date();
    }
}
