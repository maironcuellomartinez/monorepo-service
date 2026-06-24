/**
 * Property for ServiceNow request priorities
 *
 * This enum defines the priority levels for requests sent to ServiceNow.
 * Each level has a specific meaning and processing urgency.
 * The numeric values are used for sorting, with higher numbers indicating higher priority.
 */
export enum RequestPriority {

    /**
     * Property CRÍTICA
     * - Interrption of complete service
     * - Impact on multiple users/systems
     * - Immediate processing
     * - Processing in next seconds
     */
    CRITICAL = 4,

    /**
     * Property ALTA
     * - Significant interruption
     * - Impact on users/departments
     * - Processing in next minutes
     */
    HIGH = 3,

    /**
     * Property MEDIA
     * - Standard issues with limited impact
     * - Loss of non-critical functionality
     * - Processing in next hours
     * - Used for standard requests
     */
    MEDIUM = 2,

    /**
     * Property BAJA
     * - Low impact issues
     * - Non-urgent requests
     * - Processing when capacity allows
     * - Used for routine requests or improvements
     */
    LOW = 1,

    /**
     * Property DEFAULT (for initialization)
     * - Default priority for initialization
     */
    DEFAULT = 2 // MEDIUM
}

/**
 * @summary Helper class for RequestPriority
 */
export class RequestPriorityUtils {
    /**
     * @summary Get priority based on payload criteria
     */
    static determineFromPayload(incidence: any): RequestPriority {
        if (incidence.payload.severity === 'critical') return RequestPriority.CRITICAL;
        if (incidence.payload.impact >= 2 && incidence.payload.urgency >= 2) return RequestPriority.HIGH;
        if (incidence.payload.impact === 1 && incidence.payload.urgency === 1) return RequestPriority.LOW;
        return RequestPriority.DEFAULT;
    }

    static getConcurrency(priority: RequestPriority) {
        const map = {
            [RequestPriority.CRITICAL]: 4,    // 5 segundos
            [RequestPriority.HIGH]: 3,       // 15 segundos
            [RequestPriority.MEDIUM]: 2,     // 30 segundos
            [RequestPriority.LOW]: 1         // 1 minuto
        };
        return map[priority] || 1;
    }

    /**
     * @summary convert priority to human-readable text
     */
    static toLabel(priority: RequestPriority): string {
        const labels = {
            [RequestPriority.CRITICAL]: 'Crítica',
            [RequestPriority.HIGH]: 'Alta',
            [RequestPriority.MEDIUM]: 'Media',
            [RequestPriority.LOW]: 'Baja'
        };
        return labels[priority] || 'Media';
    }

    /**
     * Calcula el delay de reintento con backoff exponencial + jitter por prioridad.
     *
     * delay = clamp(base × 2^retryCount, maxDelay)
     * jitter = delay × random(0.5, 1.0)   ← "equal jitter": 50-100% del delay
     *
     * El jitter evita que múltiples reintentos sincronizados post-caída golpeen
     * a ServiceNow al mismo tiempo ("thundering herd").
     *
     * Ejemplos para MEDIUM (base=30s, techo=10min) — valores aproximados:
     *   intento 0 → 15–30s
     *   intento 1 → 30–60s
     *   intento 2 → 60–120s
     *   intento 3 → 120–240s
     *   intento 4 → 240–480s
     *   intento 5+ → 300–600s  (techo aplicado)
     *
     * Bases por prioridad:
     *   CRITICAL → 30s  (alineado con el resetTimeout del circuit breaker: 30s)
     *   HIGH     → 30s
     *   MEDIUM   → 30s
     *   LOW      → 60s
     */
    static getRetryDelay(priority: RequestPriority, retryCount = 0): number {
        const baseMsByPriority = {
            [RequestPriority.CRITICAL]: 30_000,  // igual al resetTimeout del CB
            [RequestPriority.HIGH]:     30_000,
            [RequestPriority.MEDIUM]:   30_000,
            [RequestPriority.LOW]:      60_000,
        };
        const maxDelayMsByPriority = {
            [RequestPriority.CRITICAL]:   120_000,  //  2 minutos
            [RequestPriority.HIGH]:       300_000,  //  5 minutos
            [RequestPriority.MEDIUM]:     600_000,  // 10 minutos
            [RequestPriority.LOW]:      1_800_000,  // 30 minutos
        };

        const base     = baseMsByPriority[priority]     ?? 30_000;
        const maxDelay = maxDelayMsByPriority[priority]  ?? 600_000;
        const delay    = Math.min(base * Math.pow(2, retryCount), maxDelay);
        // equal jitter: entre 50% y 100% del delay calculado
        return Math.round(delay * 0.5 + Math.random() * delay * 0.5);
    }

    /**
     * Máximo de reintentos por prioridad antes de pasar a FAILED (DLQ).
     * Invertido respecto al backoff: lo crítico merece más persistencia.
     *
     *   CRITICAL → 20 reintentos (~40–60 min de ventana total con jitter)
     *   HIGH     → 12
     *   MEDIUM   →  8
     *   LOW      →  5
     */
    static getMaxRetries(priority: RequestPriority): number {
        const map = {
            [RequestPriority.CRITICAL]: 20,
            [RequestPriority.HIGH]:     12,
            [RequestPriority.MEDIUM]:    8,
            [RequestPriority.LOW]:       5,
        };
        return map[priority] ?? 8;
    }

    /**
     * Validation of priority from string
     */
    static isValid(priority: number): boolean {
        return Object.values(RequestPriority)
            .filter(v => typeof v === 'number')
            .includes(priority);
    }
}

/**
 * Type for request priority strings
 */
export type RequestPriorityStrings = keyof typeof RequestPriority;
