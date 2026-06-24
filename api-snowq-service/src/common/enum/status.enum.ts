export enum STATUS {
    IN_PROGRESS = 'IN_PROGRESS',
    QUEUED      = 'QUEUED',      // esperando ser procesado
    DELIVERED   = 'DELIVERED',   // enviado a ServiceNow correctamente
    FAILED      = 'FAILED',      // agotó reintentos (DLQ lógica)
    CANCELLED   = 'CANCELLED',   // cancelado explícitamente (ej: recovery de Nagios)
    EXPIRED     = 'EXPIRED',     // TTL vencido antes de ser procesado (falso positivo)
    DISCARDED   = 'DISCARDED',   // descartado manualmente desde DLQ (no se reintentará)
}
