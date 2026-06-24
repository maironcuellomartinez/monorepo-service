// core/domain/enums/incident-status.enum.ts
export enum IncidentStatus {
    // ── Estado inicial ────────────────────────────────────────────────────────
    /** Cita creada; el dispositivo aún no ha sido entregado en el corner. */
    CREATED = 'CREATED',

    // ── Dispositivo en el corner ──────────────────────────────────────────────
    /** Dispositivo entregado por el cliente en la cita. Técnico pendiente de asignación. */
    DELIVERED = 'DELIVERED',

    /** Técnico trabajando activamente en la resolución. */
    IN_PROGRESS = 'IN_PROGRESS',

    // ── Estados de espera (bloquean la resolución) ────────────────────────────
    /** Pendiente de acción por parte de un tercero (proveedor, otro dpto., etc.). */
    PENDING_THIRD_PARTY = 'PENDING_THIRD_PARTY',

    /** Pendiente de acción o confirmación por parte del usuario/cliente. */
    PENDING_USER = 'PENDING_USER',

    /** Pendiente de llegada de un repuesto del proveedor. */
    PENDING_SPARE_PART = 'PENDING_SPARE_PART',

    // ── Pre-cierre: dispositivo listo para recogida ───────────────────────────
    /** Dispositivo reparado disponible en consigna / punto de soporte. */
    PENDING_PICKUP = 'PENDING_PICKUP',

    /** Dispositivo de sustitución disponible en consigna / punto de soporte. */
    PENDING_REPLACEMENT_DELIVERY = 'PENDING_REPLACEMENT_DELIVERY',

    // ── Estados terminales ────────────────────────────────────────────────────
    /** Cita cerrada; el cliente ha recogido el dispositivo. */
    CLOSED = 'CLOSED',

    /** Reabierta por el técnico (estado intermedio para volver al flujo). */
    REOPENED = 'REOPENED',

    /** Resolución validada por el cliente (confirmación final post-cierre). */
    VALIDATED = 'VALIDATED',

    /** Cita cancelada por el cliente. */
    CANCELED = 'CANCELED',
}

// ── Conjuntos de estados ──────────────────────────────────────────────────────

/** Estados que representan actividad en curso (no terminales). */
export const ACTIVE_STATUSES: IncidentStatus[] = [
    IncidentStatus.CREATED,
    IncidentStatus.DELIVERED,
    IncidentStatus.IN_PROGRESS,
    IncidentStatus.PENDING_THIRD_PARTY,
    IncidentStatus.PENDING_USER,
    IncidentStatus.PENDING_SPARE_PART,
    IncidentStatus.PENDING_PICKUP,
    IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
    IncidentStatus.REOPENED,
];

/** Estados desde los que un técnico puede tomar la incidencia. */
export const TAKEABLE_STATUSES: IncidentStatus[] = [
    IncidentStatus.CREATED,
    IncidentStatus.DELIVERED,
    IncidentStatus.IN_PROGRESS,
    IncidentStatus.PENDING_THIRD_PARTY,
    IncidentStatus.PENDING_USER,
    IncidentStatus.PENDING_SPARE_PART,
    IncidentStatus.PENDING_PICKUP,
    IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
    IncidentStatus.REOPENED,
    IncidentStatus.CLOSED,
];

/** Estados verdaderamente terminales (sin retorno posible). */
export const TERMINAL_STATUSES: IncidentStatus[] = [
    IncidentStatus.VALIDATED,
    IncidentStatus.CANCELED,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isActiveStatus(status: IncidentStatus): boolean {
    return ACTIVE_STATUSES.includes(status);
}

export function isTakeableStatus(status: IncidentStatus): boolean {
    return TAKEABLE_STATUSES.includes(status);
}

export function isTerminalStatus(status: IncidentStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
}

/**
 * Verifica si la transición `current → next` es válida según la máquina de estados.
 * Nota: las transiciones de `reopen` y `validate` van por métodos dedicados en la entidad,
 * no por `changeStatus`, por lo que CLOSED no tiene salidas aquí.
 */
export function canTransitionTo(current: IncidentStatus, next: IncidentStatus): boolean {
    const validTransitions: Record<IncidentStatus, IncidentStatus[]> = {
        [IncidentStatus.CREATED]: [IncidentStatus.DELIVERED, IncidentStatus.CANCELED],
        [IncidentStatus.DELIVERED]: [
            IncidentStatus.IN_PROGRESS,
            IncidentStatus.PENDING_THIRD_PARTY,
            IncidentStatus.PENDING_USER,
            IncidentStatus.PENDING_SPARE_PART,
        ],
        [IncidentStatus.IN_PROGRESS]: [
            IncidentStatus.PENDING_THIRD_PARTY,
            IncidentStatus.PENDING_USER,
            IncidentStatus.PENDING_SPARE_PART,
            IncidentStatus.PENDING_PICKUP,
            IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
        ],
        [IncidentStatus.PENDING_THIRD_PARTY]: [IncidentStatus.IN_PROGRESS],
        [IncidentStatus.PENDING_USER]: [IncidentStatus.IN_PROGRESS],
        [IncidentStatus.PENDING_SPARE_PART]: [IncidentStatus.IN_PROGRESS],
        [IncidentStatus.PENDING_PICKUP]: [IncidentStatus.CLOSED],
        [IncidentStatus.PENDING_REPLACEMENT_DELIVERY]: [IncidentStatus.CLOSED],
        [IncidentStatus.CLOSED]: [],   // solo via reopen() / validate()
        [IncidentStatus.REOPENED]: [IncidentStatus.IN_PROGRESS],
        [IncidentStatus.VALIDATED]: [],
        [IncidentStatus.CANCELED]: [],
    };

    return validTransitions[current]?.includes(next) ?? false;
}
