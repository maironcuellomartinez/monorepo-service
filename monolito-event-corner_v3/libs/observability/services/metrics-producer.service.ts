import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';
import { CircuitBreaker, CircuitBreakerState, DEFAULT_CIRCUIT_BREAKER_CONFIG } from '@backendkit-labs/circuit-breaker';
import { CorrelationIdService } from './correlation-id.service';

interface MetricPoint {
    name: string;
    service: string;
    value: number;
    type: 'counter' | 'gauge' | 'histogram';
    labels?: Record<string, string>;
    correlationId?: string;
    timestamp: string;
    unit?: string;
}

/**
 * Envía métricas al observability-service via HTTP POST /ingest/metrics.
 *
 * Reemplaza la implementación basada en @opentelemetry/api (que requería OTel SDK).
 * Mantiene la misma API pública para no romper código existente.
 *
 * Env vars:
 *   OBS_METRICS_URL      — endpoint (default: http://localhost:3099/ingest/metrics)
 *   OBS_METRICS_BATCH    — max puntos por batch (default: 50)
 *   OBS_METRICS_INTERVAL — ms entre flush (default: 3000)
 */
@Injectable()
export class MetricsProducerService implements OnModuleDestroy {
    private readonly logger = new Logger(MetricsProducerService.name);
    private readonly buffer: MetricPoint[] = [];
    private droppedCount = 0;

    private readonly BATCH_SIZE: number;
    private readonly FLUSH_INTERVAL_MS: number;
    private readonly MAX_BUFFER = 5_000;
    private readonly url: string;
    private flushing = false;
    private readonly timer: NodeJS.Timeout;

    private readonly agent: Agent;
    private readonly http: AxiosInstance;
    private readonly cb: CircuitBreaker;

    constructor(
        private readonly correlation: CorrelationIdService,
        @Inject('SERVICE_NAME') private readonly serviceName: string,
    ) {
        this.BATCH_SIZE = parseInt(process.env.OBS_METRICS_BATCH ?? '50', 10);
        this.FLUSH_INTERVAL_MS = parseInt(process.env.OBS_METRICS_INTERVAL ?? '3000', 10);
        this.url = process.env.OBS_METRICS_URL ?? 'http://localhost:3099/ingest/metrics';

        const m2mToken = process.env.OBS_M2M_TOKEN ?? process.env.ABAC_M2M_TOKEN;
        this.agent = new Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2 });
        this.http = axios.create({
            httpAgent: this.agent,
            timeout: 1_500,
            headers: {
                'Content-Type': 'application/json',
                ...(m2mToken ? { Authorization: `Bearer ${m2mToken}` } : {}),
            },
        });

        this.cb = new CircuitBreaker({
            ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
            name: 'obs-metrics-transport',
            failureThreshold: 60,
            slidingWindowSize: 5,
            minimumCalls: 3,
            halfOpenMaxCalls: 1,
            openTimeoutMs: 30_000,
            onStateChange: (_from, to) => {
                if (to === CircuitBreakerState.OPEN) {
                    this.logger.warn('Metrics transport circuit breaker: OPEN — pausing 30s');
                } else if (to === CircuitBreakerState.CLOSED) {
                    this.logger.log('Metrics transport circuit breaker: CLOSED (recovered)');
                }
            },
        });
        this.timer = setInterval(() => this.doFlush(), this.FLUSH_INTERVAL_MS);
    }

    onModuleDestroy(): void {
        clearInterval(this.timer);
        this.flushSync();
        this.agent.destroy();
    }

    // ── API pública (mismas firmas que la versión OTel) ───────────────────────

    recordLog(level: 'info' | 'warn' | 'error' | 'debug' | 'verbose', context: string): void {
        this.push({
            name: 'application_logs_total',
            value: 1,
            type: 'counter',
            labels: { service: this.serviceName, level, context },
        });
    }

    recordError(context: string): void {
        this.push({
            name: 'application_errors_total',
            value: 1,
            type: 'counter',
            labels: { service: this.serviceName, context },
        });
    }

    recordBusinessEvent(event: string): void {
        this.push({
            name: 'business_events_total',
            value: 1,
            type: 'counter',
            labels: { service: this.serviceName, event },
        });
    }

    observeHttpRequestDuration(
        method: string,
        path: string,
        status: number,
        outcome: 'success' | 'error',
        durationMs: number,
    ): void {
        this.push({
            name: 'http_request_duration_ms',
            value: durationMs,
            type: 'histogram',
            unit: 'ms',
            labels: { service: this.serviceName, method, path, status: String(status), outcome },
        });
    }

    incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
        this.push({
            name,
            value,
            type: 'counter',
            labels: { service: this.serviceName, ...this.correlation.getLabels(), ...labels },
        });
    }

    observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
        this.push({
            name,
            value,
            type: 'histogram',
            unit: 'ms',
            labels: { service: this.serviceName, ...this.correlation.getLabels(), ...labels },
        });
    }

    // ── Interno ───────────────────────────────────────────────────────────────

    private push(point: Omit<MetricPoint, 'timestamp' | 'service' | 'correlationId'> & Partial<Pick<MetricPoint, 'service'>>): void {
        if (this.buffer.length >= this.MAX_BUFFER) {
            this.droppedCount++;
            return;
        }
        this.buffer.push({
            ...point,
            service: point.service ?? this.serviceName,
            correlationId: this.correlation.getCorrelationId(),
            timestamp: new Date().toISOString(),
        });
        if (this.buffer.length >= this.BATCH_SIZE) this.doFlush();
    }

    private doFlush(): void {
        if (this.buffer.length === 0 || this.flushing) return;
        this.flushing = true;

        const batch = this.buffer.splice(0, this.BATCH_SIZE);

        this.send(batch)
            .then(({ ok, failed }) => {
                if (failed > 0) this.logger.warn(`Metrics transport: ${ok} sent, ${failed} dropped`);
                if (this.droppedCount > 0) {
                    this.logger.warn(`Metrics transport: ${this.droppedCount} points dropped (buffer cap)`);
                    this.droppedCount = 0;
                }
            })
            .catch(() => { })
            .finally(() => { this.flushing = false; });
    }

    private flushSync(): void {
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.BATCH_SIZE);
            this.send(batch).catch(() => { });
        }
    }

    private async send(batch: MetricPoint[]): Promise<{ ok: number; failed: number }> {
        try {
            await this.cb.execute(() => this.http.post(this.url, { metrics: batch }));
            return { ok: batch.length, failed: 0 };
        } catch {
            // Falla real o circuito abierto (CircuitBreakerOpenError): batch no enviado.
            return { ok: 0, failed: batch.length };
        }
    }
}
