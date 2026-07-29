// core/domain/value-objects/servicenow-ticket-type.value.ts

/**
 * Tipo de ticket ServiceNow que representa un `ServiceNowTicketLink`.
 * Mapea la jerarquía real de ServiceNow: un Incident es un ticket plano;
 * una Request se materializa como un ítem (`sc_req_item`/RITM) dentro de un
 * `sc_request` contenedor (no trackeado como entidad propia); el trabajo de
 * cumplimiento de esa RITM se registra como `sc_task`.
 */
export type ServiceNowTicketType = 'incident' | 'sc_req_item' | 'sc_task';
