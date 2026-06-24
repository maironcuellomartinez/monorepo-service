import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    CircuitBreaker,
    CircuitBreakerOpenError,
} from '@backendkit-labs/circuit-breaker';
import {
    Bulkhead,
    BulkheadRejectedError,
    BulkheadTimeoutError,
} from '@backendkit-labs/bulkhead';

/**
 * Resiliencia para llamadas salientes del gateway hacia integration-service.
 *
 * Construido sobre las librerías propias de resiliencia:
 *  - Circuit breaker (@backendkit-labs/circuit-breaker) — ventana deslizante,
 *    abre al ≥50% de fallos sobre ≥3 llamadas. Distingue error de negocio (4xx,
 *    transparente) de error de infraestructura (5xx / red / timeout, cuenta).
 *  - Bulkhead (@backendkit-labs/bulkhead) — dos instancias independientes
 *    (escrituras / lecturas) que rechazan de inmediato al saturar la concurrencia.
 *  - Timeouts configurables por tipo de operación, exportados para uso en controllers.
 *
 * Env vars (todos opcionales con defaults razonables):
 *   OUTBOUND_WRITE_TIMEOUT_MS     Timeout para operaciones de escritura (default 12s)
 *   OUTBOUND_READ_TIMEOUT_MS      Timeout para operaciones de lectura   (default 5s)
 *   OUTBOUND_CB_TIMEOUT_MS        Umbral de llamada lenta del circuit breaker (default 15s)
 *   OUTBOUND_WRITE_CONCURRENCY    Slots concurrentes para escrituras     (default 20)
 *   OUTBOUND_READ_CONCURRENCY     Slots concurrentes para lecturas       (default 10)
 */
@Injectable()
export class OutboundResilienceService {
    private readonly logger = new Logger(OutboundResilienceService.name);

    private readonly breaker: CircuitBreaker;
    private readonly writeBulkhead: Bulkhead;
    private readonly readBulkhead: Bulkhead;

    readonly writeTimeout: number;
    readonly readTimeout: number;

    constructor(private readonly config: ConfigService) {
        const writeLimit = this.config.get<number>('OUTBOUND_WRITE_CONCURRENCY', 20);
        const readLimit = this.config.get<number>('OUTBOUND_READ_CONCURRENCY', 10);
        this.writeTimeout = this.config.get<number>('OUTBOUND_WRITE_TIMEOUT_MS', 12_000);
        this.readTimeout = this.config.get<number>('OUTBOUND_READ_TIMEOUT_MS', 5_000);

        const slowCallMs = this.config.get<number>('OUTBOUND_CB_TIMEOUT_MS', 15_000);

        this.breaker = new CircuitBreaker({
            name: 'integration-service',
            failureThreshold: 50,
            slowCallThreshold: 100,      // desactivado: no abrir por llamadas lentas
            slowCallDurationMs: slowCallMs,
            minimumCalls: 3,             // antes volumeThreshold
            slidingWindowSize: 10,
            halfOpenMaxCalls: 3,
            openTimeoutMs: 30_000,       // antes resetTimeout
            // 4xx = error de cliente → negocio (no abre circuito). Resto = infraestructura.
            isFailure: (err: unknown): boolean => {
                const status =
                    (err as any)?.response?.status ?? (err as any)?.status;
                if (typeof status === 'number' && status >= 400 && status < 500) {
                    return false;
                }
                return true;
            },
            onStateChange: (from, to) => {
                if (to === 'open') {
                    this.logger.warn('[CB] OPEN — integration-service no disponible, rechazando llamadas');
                } else if (to === 'half_open') {
                    this.logger.log('[CB] HALF-OPEN — probando conectividad con integration-service');
                } else if (to === 'closed') {
                    this.logger.log('[CB] CLOSED — integration-service disponible');
                }
            },
        });

        // maxQueueSize: 0 + rejectWhenFull → rechazo inmediato al saturar (sin cola),
        // replicando el bulkhead por contadores previo.
        this.writeBulkhead = new Bulkhead({
            name: 'outbound-writes',
            maxConcurrentCalls: writeLimit,
            maxQueueSize: 0,
            queueTimeoutMs: this.writeTimeout,
            rejectWhenFull: true,
        });
        this.readBulkhead = new Bulkhead({
            name: 'outbound-reads',
            maxConcurrentCalls: readLimit,
            maxQueueSize: 0,
            queueTimeoutMs: this.readTimeout,
            rejectWhenFull: true,
        });
    }

    /** Ejecuta una operación de escritura (POST, PATCH, DELETE) con bulkhead + circuit breaker. */
    async fireWrite<T>(fn: () => Promise<T>): Promise<T> {
        return this.run(this.writeBulkhead, fn);
    }

    /** Ejecuta una operación de lectura (GET) con bulkhead + circuit breaker. */
    async fireRead<T>(fn: () => Promise<T>): Promise<T> {
        return this.run(this.readBulkhead, fn);
    }

    private async run<T>(bulkhead: Bulkhead, fn: () => Promise<T>): Promise<T> {
        try {
            // Bulkhead afuera, circuit breaker adentro (igual que la versión previa).
            return await bulkhead.execute(() => this.breaker.execute(fn));
        } catch (err) {
            if (err instanceof BulkheadRejectedError || err instanceof BulkheadTimeoutError) {
                throw new ServiceUnavailableException(err.message);
            }
            if (err instanceof CircuitBreakerOpenError) {
                throw new ServiceUnavailableException(
                    'integration-service no disponible (circuit open)',
                );
            }
            throw err;
        }
    }

    getStatus() {
        return {
            circuitBreaker: this.breaker.getMetrics(),
            bulkhead: {
                writes: this.writeBulkhead.getMetrics(),
                reads: this.readBulkhead.getMetrics(),
            },
        };
    }
}
