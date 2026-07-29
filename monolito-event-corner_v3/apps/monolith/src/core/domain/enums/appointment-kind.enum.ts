// core/domain/enums/appointment-kind.enum.ts
import { IssueCategory } from './issue-category.enum';
import { ServiceNowTicketType } from '../value-objects/servicenow-ticket-type.value';

/**
 * Qué familia de ticket ServiceNow produce esta cita. No decide la clase del
 * agregado (siempre es `Appointment`), solo qué estrategia de creación de
 * ticket aplica ServiceNowIntegrationService.
 */
export enum AppointmentKind {
    ISSUE = 'ISSUE',
    REQUEST = 'REQUEST',
}

/**
 * Clasificación de negocio (no necesariamente igual al mecanismo técnico de
 * creación hoy disponible — ver `serviceNowTicketTypeFromCategory`):
 * qué tipo de ticket SN corresponde a cada categoría real de IssueType.
 * Confirmado con el negocio: ISSUE/CREATE-DELIVERY/CREATE-COLLECTION son
 * incidentes; REQUEST-ONBOARDING/REQUEST-DECOMISSION son tareas (sc_task),
 * aunque el mecanismo de creación que existe hoy solo sabe crear el RITM
 * (sc_req_item) que dispara el workflow de SN que genera esa sc_task — ver
 * ServiceNowTicketLink.type, que sigue siendo 'sc_req_item' para estas dos.
 */
const CATEGORY_TICKET_TYPE: Record<IssueCategory, ServiceNowTicketType> = {
    [IssueCategory.ISSUE]: 'incident',
    [IssueCategory.CREATE_DELIVERY]: 'incident',
    [IssueCategory.CREATE_COLLECTION]: 'incident',
    [IssueCategory.REQUEST_ONBOARDING]: 'sc_task',
    [IssueCategory.REQUEST_DECOMISSION]: 'sc_task',
};

/**
 * Tipo de ticket SN que el negocio percibe para esta categoría (usado para
 * mostrar el badge Incidencia/Tarea en el dashboard). No confundir con el
 * `ServiceNowTicketLink.type` técnico que efectivamente se persiste — ver
 * comentario arriba.
 */
export function serviceNowTicketTypeFromCategory(category: IssueCategory): ServiceNowTicketType {
    return CATEGORY_TICKET_TYPE[category] ?? 'incident';
}

/**
 * Deriva el `AppointmentKind` (mecanismo técnico de creación) a partir de
 * `IssueType.category`. Colapsa sc_req_item/sc_task a REQUEST-kind, ya que
 * ambos usan hoy el mismo mecanismo de creación (`createRequest()`).
 */
export function appointmentKindFromIssueCategory(category: IssueCategory): AppointmentKind {
    return serviceNowTicketTypeFromCategory(category) === 'incident'
        ? AppointmentKind.ISSUE
        : AppointmentKind.REQUEST;
}
