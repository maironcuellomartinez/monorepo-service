// core/domain/enums/appointment-status.enum.ts
export enum AppointmentStatus {
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
export const ACTIVE_STATUSES: AppointmentStatus[] = [
    AppointmentStatus.CREATED,
    AppointmentStatus.DELIVERED,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.PENDING_THIRD_PARTY,
    AppointmentStatus.PENDING_USER,
    AppointmentStatus.PENDING_SPARE_PART,
    AppointmentStatus.PENDING_PICKUP,
    AppointmentStatus.PENDING_REPLACEMENT_DELIVERY,
    AppointmentStatus.REOPENED,
];

/** Estados desde los que un técnico puede tomar la cita. */
export const TAKEABLE_STATUSES: AppointmentStatus[] = [
    AppointmentStatus.CREATED,
    AppointmentStatus.DELIVERED,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.PENDING_THIRD_PARTY,
    AppointmentStatus.PENDING_USER,
    AppointmentStatus.PENDING_SPARE_PART,
    AppointmentStatus.PENDING_PICKUP,
    AppointmentStatus.PENDING_REPLACEMENT_DELIVERY,
    AppointmentStatus.REOPENED,
    AppointmentStatus.CLOSED,
];

/** Estados verdaderamente terminales (sin retorno posible). */
export const TERMINAL_STATUSES: AppointmentStatus[] = [
    AppointmentStatus.VALIDATED,
    AppointmentStatus.CANCELED,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verifica si la transición `current → next` es válida según la máquina de estados.
 * Nota: las transiciones de `reopen` y `validate` van por métodos dedicados en la entidad,
 * no por `changeStatus`, por lo que CLOSED no tiene salidas aquí.
 * El técnico puede cerrar como resuelta desde cualquier estado activo (paridad
 * legacy) — no hace falta pasar por PENDING_PICKUP/PENDING_REPLACEMENT_DELIVERY.
 */
export function canTransitionTo(current: AppointmentStatus, next: AppointmentStatus): boolean {
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
        [AppointmentStatus.CREATED]: [AppointmentStatus.DELIVERED, AppointmentStatus.CANCELED],
        [AppointmentStatus.DELIVERED]: [
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.CLOSED,
        ],
        [AppointmentStatus.IN_PROGRESS]: [
            AppointmentStatus.PENDING_THIRD_PARTY,
            AppointmentStatus.PENDING_USER,
            AppointmentStatus.PENDING_SPARE_PART,
            AppointmentStatus.PENDING_PICKUP,
            AppointmentStatus.PENDING_REPLACEMENT_DELIVERY,
            AppointmentStatus.CLOSED,
        ],
        [AppointmentStatus.PENDING_THIRD_PARTY]: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CLOSED],
        [AppointmentStatus.PENDING_USER]: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CLOSED],
        [AppointmentStatus.PENDING_SPARE_PART]: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CLOSED],
        [AppointmentStatus.PENDING_PICKUP]: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CLOSED],
        [AppointmentStatus.PENDING_REPLACEMENT_DELIVERY]: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CLOSED],
        [AppointmentStatus.CLOSED]: [],   // solo via reopen() / validate()
        // REOPENED = nuevo slot, el cliente debe entregar el dispositivo de
        // nuevo (igual que CREATED) — no salta directo a IN_PROGRESS.
        [AppointmentStatus.REOPENED]: [
            AppointmentStatus.DELIVERED,
            AppointmentStatus.CLOSED,
            AppointmentStatus.CANCELED,
        ],
        [AppointmentStatus.VALIDATED]: [],
        [AppointmentStatus.CANCELED]: [],
    };

    return validTransitions[current]?.includes(next) ?? false;
}
