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
    expected_start?: Date;
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
}

export interface ServiceNowTicketResult {
    sysId: string;
    number: string;
    /** true when the ticket was queued asynchronously via api-snowq-service */
    deferred?: boolean;
    /** correlationId returned by api-snowq-service async mode; present only when deferred = true */
    correlationId?: string;
}

export interface IServiceNowClient {
    /** Crea un ticket de tipo Incident en ServiceNow */
    createIncident(payload: ServiceNowIncidentPayload): Promise<Result<ServiceNowTicketResult>>;

    /** Crea un ticket de tipo Request (sc_req_item) en ServiceNow */
    createRequest(payload: ServiceNowRequestPayload): Promise<Result<ServiceNowTicketResult>>;

    /** Actualiza campos arbitrarios de un ticket */
    updateTicket(table: string, sysId: string, fields: Record<string, any>): Promise<Result<void>>;

    /** Cierra un ticket de incident con categoría y notas de cierre */
    closeIncident(sysId: string, closeCategory: string, closeNotes?: string): Promise<Result<void>>;

    /** Consulta el estado actual de un incident en ServiceNow. Retorna el state code ('1','2','6','7') o null si no existe. */
    queryIncidentState(sysId: string): Promise<Result<string | null>>;
}
