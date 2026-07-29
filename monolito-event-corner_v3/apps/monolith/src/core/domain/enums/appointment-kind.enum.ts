// core/domain/enums/appointment-kind.enum.ts
import { IssueCategory } from './issue-category.enum';

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
 * Deriva el `AppointmentKind` a partir de `IssueType.category`.
 * `ISSUE` → incidencia de soporte. Cualquier variante `REQUEST*` → solicitud
 * (mapea a un ticket sc_req_item/RITM en ServiceNow).
 */
export function appointmentKindFromIssueCategory(category: IssueCategory): AppointmentKind {
    return category === IssueCategory.ISSUE ? AppointmentKind.ISSUE : AppointmentKind.REQUEST;
}
