// core/domain/constants/appointment.constants.ts
export const APPOINTMENT_CONSTANTS = {
    MIN_PRIORITY: 1,
    MAX_PRIORITY: 5,
    DEFAULT_PRIORITY: 3,
    MAX_COMMENT_LENGTH: 500,
    MIN_DURATION_MINUTES: 15,
    MAX_DURATION_MINUTES: 480, // 8 horas

    // Transiciones válidas por estado (accionadas por el técnico vía changeStatus).
    // Máquina única para ambos kinds (ISSUE/REQUEST) — es superset de lo que
    // Request necesitaba (que hoy solo tenía un status: string libre).
    // reopen() y validate() tienen sus propios métodos en la entidad.
    // El técnico puede cerrar la cita como resuelta desde cualquier estado
    // activo (paridad legacy) — no hace falta pasar por PENDING_PICKUP/PENDING_REPLACEMENT_DELIVERY.
    VALID_STATUS_TRANSITIONS: {
        CREATED: ['DELIVERED', 'CANCELED'],
        DELIVERED: ['IN_PROGRESS', 'CLOSED'],
        IN_PROGRESS: ['PENDING_THIRD_PARTY', 'PENDING_USER', 'PENDING_SPARE_PART', 'PENDING_PICKUP', 'PENDING_REPLACEMENT_DELIVERY', 'CLOSED'],
        PENDING_THIRD_PARTY: ['IN_PROGRESS', 'CLOSED'],
        PENDING_USER: ['IN_PROGRESS', 'CLOSED'],
        PENDING_SPARE_PART: ['IN_PROGRESS', 'CLOSED'],
        PENDING_PICKUP: ['IN_PROGRESS', 'CLOSED'],
        PENDING_REPLACEMENT_DELIVERY: ['IN_PROGRESS', 'CLOSED'],
        CLOSED: [],     // sale via reopen() (→REOPENED) o validate() (→VALIDATED)
        // REOPENED = nuevo slot, el cliente debe entregar el dispositivo de nuevo
        // (igual que CREATED) — no salta directo a IN_PROGRESS.
        REOPENED: ['DELIVERED', 'CLOSED', 'CANCELED'],
        VALIDATED: [],  // terminal definitivo
        CANCELED: [],   // terminal definitivo — no se reabre
    }
} as const;
