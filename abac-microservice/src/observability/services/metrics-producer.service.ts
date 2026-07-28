import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';
import { CorrelationIdService } from './correlation-id.service';

export const OBSERVABILITY_SERVICE_NAME = 'OBSERVABILITY_SERVICE_NAME';

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
 * Circuit breaker liviano en memoria — evita golpear observability-service
 * en cada request cuando está caído. Sin dependencia externa.
 */
class SimpleCircuitBreaker {
    private failures = 0;
    private openUntil = 0;
    constructor(private readonly threshold = 5, private readonly resetMs = 30_000, private readonly logger?: Logger) {}
    get isOpen(): boolean {
        if (this.failures < this.threshold) return false;
        if (Date.now() >= this.openUntil) { this.failures = 0; return false; }
        return true;
    }
    ok(): void { this.failures = 0; }
    fail(): void {
        this.failures++;
        if (this.failures === this.threshold) {
            this.openUntil = Date.now() + this.resetMs;
            this.logger?.warn(`Metrics circuit breaker: OPEN ${this.resetMs / 1000}s`);
        }
    }
}

/**
 * Envía métricas a observability-service via HTTP POST /ingest/metrics.
 * No requiere OTel SDK (reemplaza al stub no-op previo basado en @opentelemetry/api).
 * Mantiene la misma API pública (observeHistogram/incrementCounter) para no romper
 * a los ~8 consumidores existentes (PerformanceInterceptor, MonitoringService, etc.)
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
    private readonly cb: SimpleCircuitBreaker;

    constructor(
        private readonly correlation: CorrelationIdService,
        @Inject(OBSERVABILITY_SERVICE_NAME) private readonly serviceName: string,
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

        this.cb = new SimpleCircuitBreaker(5, 30_000, this.logger);
        this.timer = setInterval(() => this.doFlush(), this.FLUSH_INTERVAL_MS);
    }

    onModuleDestroy(): void {
        clearInterval(this.timer);
        this.flushSync();
        this.agent.destroy();
    }

    // ── API pública (mismas firmas que la versión OTel previa) ────────────────

    observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
        this.push({
            name,
            value,
            type: 'histogram',
            unit: 'ms',
            labels: { ...this.correlation.getLabels(), ...labels },
        });
    }

    incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
        this.push({
            name,
            value,
            type: 'counter',
            labels: { ...this.correlation.getLabels(), ...labels },
        });
    }

    async publishLog(_logData: any, _level?: 'info' | 'warn' | 'error' | 'debug'): Promise<void> {
        // Broker client not configured — log forwarding disabled.
    }

    // ── Interno ────────────────────────────────────────────────────────────────

    private push(point: Omit<MetricPoint, 'service' | 'timestamp' | 'correlationId'>): void {
        if (this.buffer.length >= this.MAX_BUFFER) {
            this.droppedCount++;
            return;
        }
        this.buffer.push({
            ...point,
            service: this.serviceName,
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
            .catch(() => {})
            .finally(() => { this.flushing = false; });
    }

    private flushSync(): void {
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.BATCH_SIZE);
            this.send(batch).catch(() => {});
        }
    }

    private async send(batch: MetricPoint[]): Promise<{ ok: number; failed: number }> {
        if (this.cb.isOpen) return { ok: 0, failed: batch.length };
        try {
            await this.http.post(this.url, { metrics: batch });
            this.cb.ok();
            return { ok: batch.length, failed: 0 };
        } catch {
            this.cb.fail();
            return { ok: 0, failed: batch.length };
        }
    }
}
