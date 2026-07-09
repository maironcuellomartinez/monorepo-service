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
 * Resiliencia para llamadas salientes del gateway hacia api-snowq-service.
 *
 * Construido sobre las librerías propias de resiliencia:
 *  - Circuit breaker (@backendkit-labs/circuit-breaker) — ventana deslizante,
 *    abre al ≥50% de fallos sobre ≥3 llamadas. Distingue error de negocio (4xx,
 *    transparente) de error de infraestructura (5xx / red / timeout, cuenta).
 *    Dos breakers INDEPENDIENTES: uno para el intento "immediate" (fase 1 de
 *    creación, donde un 5xx es esperado/tolerado porque cae al fallback async)
 *    y otro para todo lo demás (queue, update, close, reconcile, retry). Si
 *    compartieran breaker, cada caída de SN abriría el circuito de "immediate"
 *    Y bloquearía también el fallback a cola — exactamente el mecanismo de
 *    degradación que se busca preservar.
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
    private readonly immediateBreaker: CircuitBreaker;
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

        const isInfraFailure = (err: unknown): boolean => {
            const status = (err as any)?.response?.status ?? (err as any)?.status;
            // 4xx = error de cliente → negocio (no abre circuito). Resto = infraestructura.
            if (typeof status === 'number' && status >= 400 && status < 500) {
                return false;
            }
            return true;
        };

        this.breaker = new CircuitBreaker({
            name: 'api-snowq-service',
            failureThreshold: 50,
            slowCallThreshold: 100,      // desactivado: no abrir por llamadas lentas
            slowCallDurationMs: slowCallMs,
            minimumCalls: 3,             // antes volumeThreshold
            slidingWindowSize: 10,
            halfOpenMaxCalls: 3,
            openTimeoutMs: 30_000,       // antes resetTimeout
            isFailure: isInfraFailure,
            onStateChange: (from, to) => {
                if (to === 'open') {
                    this.logger.warn('[CB queue] OPEN — api-snowq-service no disponible, rechazando llamadas');
                } else if (to === 'half_open') {
                    this.logger.log('[CB queue] HALF-OPEN — probando conectividad con api-snowq-service');
                } else if (to === 'closed') {
                    this.logger.log('[CB queue] CLOSED — api-snowq-service disponible');
                }
            },
        });

        this.immediateBreaker = new CircuitBreaker({
            name: 'api-snowq-service-immediate',
            failureThreshold: 50,
            slowCallThreshold: 100,
            slowCallDurationMs: slowCallMs,
            minimumCalls: 3,
            slidingWindowSize: 10,
            halfOpenMaxCalls: 3,
            openTimeoutMs: 30_000,
            isFailure: isInfraFailure,
            onStateChange: (from, to) => {
                if (to === 'open') {
                    this.logger.warn('[CB immediate] OPEN — modo síncrono no disponible, cayendo directo a fallback async');
                } else if (to === 'half_open') {
                    this.logger.log('[CB immediate] HALF-OPEN — probando modo síncrono de nuevo');
                } else if (to === 'closed') {
                    this.logger.log('[CB immediate] CLOSED — modo síncrono recuperado');
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

    /** Ejecuta una operación de escritura (POST, PATCH, DELETE) con bulkhead + circuit breaker "queue". */
    async fireWrite<T>(fn: () => Promise<T>): Promise<T> {
        return this.run(this.writeBulkhead, this.breaker, fn);
    }

    /** Ejecuta una operación de lectura (GET) con bulkhead + circuit breaker "queue". */
    async fireRead<T>(fn: () => Promise<T>): Promise<T> {
        return this.run(this.readBulkhead, this.breaker, fn);
    }

    /**
     * Ejecuta el intento "immediate" (fase 1 de creación) con su propio circuit
     * breaker, aislado del resto — un 5xx acá es esperado cuando SN está caído
     * (se cae al fallback async) y NO debe abrir el breaker que protege
     * update/close/reconcile/retry.
     */
    async fireImmediate<T>(fn: () => Promise<T>): Promise<T> {
        return this.run(this.writeBulkhead, this.immediateBreaker, fn);
    }

    private async run<T>(bulkhead: Bulkhead, breaker: CircuitBreaker, fn: () => Promise<T>): Promise<T> {
        try {
            // Bulkhead afuera, circuit breaker adentro (igual que la versión previa).
            return await bulkhead.execute(() => breaker.execute(fn));
        } catch (err) {
            if (err instanceof BulkheadRejectedError || err instanceof BulkheadTimeoutError) {
                throw new ServiceUnavailableException(err.message);
            }
            if (err instanceof CircuitBreakerOpenError) {
                throw new ServiceUnavailableException(
                    'api-snowq-service no disponible (circuit open)',
                );
            }
            throw err;
        }
    }

    getStatus() {
        return {
            circuitBreaker: this.breaker.getMetrics(),
            circuitBreakerImmediate: this.immediateBreaker.getMetrics(),
            bulkhead: {
                writes: this.writeBulkhead.getMetrics(),
                reads: this.readBulkhead.getMetrics(),
            },
        };
    }
}
