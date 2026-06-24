// core/domain/enums/device-status.enum.ts

export enum DeviceStatus {
    /** Sincronizado y dentro del TTL */
    SYNCED = 'SYNCED',
    /** Pendiente de resincronización (TTL expirado) */
    STALE = 'STALE',
    /** No encontrado en el inventario externo */
    NOT_FOUND = 'NOT_FOUND',
    /** Error al intentar sincronizar */
    SYNC_ERROR = 'SYNC_ERROR',
    /** Dispositivo virtual — placeholder para onboarding/entrega, no sincroniza con Minerva */
    VIRTUAL = 'VIRTUAL',
    /** Dispositivo deshabilitado manualmente — no sincroniza ni participa en nuevas incidencias */
    DISABLED = 'DISABLED',
}
