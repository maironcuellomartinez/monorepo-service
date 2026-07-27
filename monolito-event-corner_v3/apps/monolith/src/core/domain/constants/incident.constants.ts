// core/domain/constants/incident.constants.ts
export const INCIDENT_CONSTANTS = {
    MIN_PRIORITY: 1,
    MAX_PRIORITY: 5,
    DEFAULT_PRIORITY: 3,
    MAX_COMMENT_LENGTH: 500,
    MIN_DURATION_MINUTES: 15,
    MAX_DURATION_MINUTES: 480, // 8 horas

    // Transiciones válidas por estado (accionadas por el técnico vía changeStatus)
    // reopen() y validate() tienen sus propios métodos en la entidad.
    // El técnico puede cerrar la incidencia como resuelta desde cualquier estado
    // activo (paridad legacy) — dispara el email al cliente para retirar el
    // dispositivo. No hace falta pasar por PENDING_PICKUP/PENDING_REPLACEMENT_DELIVERY.
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
        CANCELED: [],   // sale via reopen() (→REOPENED) — recuperar cancelada por error
    }
} as const;

// core/domain/constants/slot.constants.ts
export const SLOT_CONSTANTS = {
    DEFAULT_DURATION: 15,
    MIN_DURATION: 5,
    MAX_DURATION: 60,
    MAX_FUTURE_DAYS: 60, // Generar slots con 60 días de antelación
    CACHE_TTL_SECONDS: 30 // TTL para caché de disponibilidad
} as const;