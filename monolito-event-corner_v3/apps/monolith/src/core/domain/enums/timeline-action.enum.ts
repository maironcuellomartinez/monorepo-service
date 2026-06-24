// core/domain/enums/timeline-action.enum.ts
export enum TimelineAction {
    // Estados de ciclo de vida
    CREATED                      = 'CREATED',
    DELIVERED                    = 'DELIVERED',
    IN_PROGRESS                  = 'IN_PROGRESS',
    PENDING_THIRD_PARTY          = 'PENDING_THIRD_PARTY',
    PENDING_USER                 = 'PENDING_USER',
    PENDING_SPARE_PART           = 'PENDING_SPARE_PART',
    PENDING_PICKUP               = 'PENDING_PICKUP',
    PENDING_REPLACEMENT_DELIVERY = 'PENDING_REPLACEMENT_DELIVERY',
    CLOSED                       = 'CLOSED',
    REOPENED                     = 'REOPENED',
    VALIDATED                    = 'VALIDATED',
    CANCELED                     = 'CANCELED',

    // Acciones de asignación
    ASSIGNED           = 'ASSIGNED',
    ACCEPTED           = 'ACCEPTED',
    TECHNICIAN_CHANGED = 'TECHNICIAN_CHANGED',

    // Acciones de comunicación / auditoría
    NOTE_ADDED        = 'NOTE_ADDED',
    EVIDENCE_ATTACHED = 'EVIDENCE_ATTACHED',
    STATUS_CHANGED    = 'STATUS_CHANGED',
    LOCATION_UPDATED  = 'LOCATION_UPDATED',
    ESCALATED         = 'ESCALATED',
    DE_ESCALATED      = 'DE_ESCALATED',
}

export const STATUS_ACTIONS: TimelineAction[] = [
    TimelineAction.CREATED,
    TimelineAction.DELIVERED,
    TimelineAction.IN_PROGRESS,
    TimelineAction.PENDING_THIRD_PARTY,
    TimelineAction.PENDING_USER,
    TimelineAction.PENDING_SPARE_PART,
    TimelineAction.PENDING_PICKUP,
    TimelineAction.PENDING_REPLACEMENT_DELIVERY,
    TimelineAction.CLOSED,
    TimelineAction.REOPENED,
    TimelineAction.VALIDATED,
    TimelineAction.CANCELED,
];

export const ASSIGNMENT_ACTIONS: TimelineAction[] = [
    TimelineAction.ASSIGNED,
    TimelineAction.ACCEPTED,
    TimelineAction.TECHNICIAN_CHANGED,
];

export const COMMUNICATION_ACTIONS: TimelineAction[] = [
    TimelineAction.NOTE_ADDED,
    TimelineAction.EVIDENCE_ATTACHED,
];

export function isStatusAction(action: TimelineAction): boolean {
    return STATUS_ACTIONS.includes(action);
}

export function isAssignmentAction(action: TimelineAction): boolean {
    return ASSIGNMENT_ACTIONS.includes(action);
}

export function isCommunicationAction(action: TimelineAction): boolean {
    return COMMUNICATION_ACTIONS.includes(action);
}

export function getActionName(action: TimelineAction): string {
    const names: Record<TimelineAction, string> = {
        [TimelineAction.CREATED]:                      'Cita creada',
        [TimelineAction.DELIVERED]:                    'Dispositivo entregado',
        [TimelineAction.IN_PROGRESS]:                  'En resolución',
        [TimelineAction.PENDING_THIRD_PARTY]:          'Pendiente de tercero',
        [TimelineAction.PENDING_USER]:                 'Pendiente de usuario',
        [TimelineAction.PENDING_SPARE_PART]:           'Pendiente de repuesto',
        [TimelineAction.PENDING_PICKUP]:               'Pendiente recogida (reparado)',
        [TimelineAction.PENDING_REPLACEMENT_DELIVERY]: 'Pendiente recogida (sustitución)',
        [TimelineAction.CLOSED]:                       'Cita cerrada',
        [TimelineAction.REOPENED]:                     'Reabierta',
        [TimelineAction.VALIDATED]:                    'Validada por cliente',
        [TimelineAction.CANCELED]:                     'Cita cancelada',
        [TimelineAction.ASSIGNED]:                     'Asignada a técnico',
        [TimelineAction.ACCEPTED]:                     'Aceptada por técnico',
        [TimelineAction.TECHNICIAN_CHANGED]:           'Técnico cambiado',
        [TimelineAction.NOTE_ADDED]:                   'Nota añadida',
        [TimelineAction.EVIDENCE_ATTACHED]:            'Evidencia adjuntada',
        [TimelineAction.STATUS_CHANGED]:               'Estado cambiado',
        [TimelineAction.LOCATION_UPDATED]:             'Ubicación actualizada',
        [TimelineAction.ESCALATED]:                    'Escalada',
        [TimelineAction.DE_ESCALATED]:                 'Desescalada',
    };
    return names[action];
}
