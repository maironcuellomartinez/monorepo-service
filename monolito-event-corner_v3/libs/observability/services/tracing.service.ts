import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';
import { CircuitBreaker, CircuitBreakerState, DEFAULT_CIRCUIT_BREAKER_CONFIG } from '@backendkit-labs/circuit-breaker';
import { CorrelationIdService } from './correlation-id.service';

interface TraceContext {
    traceId: string;
    spanId: string;
}

interface SpanRecord {
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    name: string;
    serviceName: string;
    correlationId: string | null;
    kind: number;                   // 1=SERVER 2=CLIENT 3=PRODUCER 4=CONSUMER
    statusCode: number;             // 1=OK 2=ERROR
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    durationMs: number;
    attributes: Record<string, string>;
    error?: string;
}

/**
 * Tracing HTTP-direct — envía spans al observability-service en formato OTLP/HTTP JSON.
 * No requiere OTel SDK. Propaga traceId/spanId via AsyncLocalStorage.
 *
 * Env vars:
 *   OBS_TRACES_URL       — default: http://localhost:3099/ingest/traces
 *   OBS_TRACES_BATCH     — max spans por batch (default: 50)
 *   OBS_TRACES_INTERVAL  — ms entre flush (default: 2000)
 */
@Injectable()
export class TracingService implements OnModuleDestroy {
    private readonly logger = new Logger(TracingService.name);
    private readonly als = new AsyncLocalStorage<TraceContext>();
    private readonly buffer: SpanRecord[] = [];
    private droppedCount = 0;
    private flushing = false;

    private readonly BATCH_SIZE: number;
    private readonly FLUSH_INTERVAL_MS: number;
    private readonly MAX_BUFFER = 2_000;
    private readonly url: string;
    private readonly timer: NodeJS.Timeout;

    private readonly agent: Agent;
    private readonly http: AxiosInstance;
    private readonly cb: CircuitBreaker;

    constructor(
        private readonly correlationId: CorrelationIdService,
        @Inject('SERVICE_NAME') private readonly serviceName: string,
    ) {
        this.BATCH_SIZE = parseInt(process.env.OBS_TRACES_BATCH ?? '50', 10);
        this.FLUSH_INTERVAL_MS = parseInt(process.env.OBS_TRACES_INTERVAL ?? '2000', 10);
        this.url = process.env.OBS_TRACES_URL ?? 'http://localhost:3099/ingest/traces';

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
            name: 'obs-traces-transport',
            failureThreshold: 60,
            slidingWindowSize: 5,
            minimumCalls: 3,
            halfOpenMaxCalls: 1,
            openTimeoutMs: 30_000,
            onStateChange: (_from, to) => {
                if (to === CircuitBreakerState.OPEN) {
                    this.logger.warn('Tracing transport circuit breaker: OPEN — pausing 30s');
                } else if (to === CircuitBreakerState.CLOSED) {
                    this.logger.log('Tracing transport circuit breaker: CLOSED (recovered)');
                }
            },
        });
        this.timer = setInterval(() => this.doFlush(), this.FLUSH_INTERVAL_MS);
    }

    onModuleDestroy(): void {
        clearInterval(this.timer);
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.BATCH_SIZE);
            this.sendBatch(batch).catch(() => {});
        }
        this.agent.destroy();
    }

    // ── Acceso al contexto activo ─────────────────────────────────────────────

    getTraceId(): string | undefined {
        return this.als.getStore()?.traceId;
    }

    getSpanId(): string | undefined {
        return this.als.getStore()?.spanId;
    }

    // ── Instrumentación ───────────────────────────────────────────────────────

    /**
     * Ejecuta fn dentro de un span. Propaga traceId a spans hijos.
     *
     * @example
     * return this.tracing.run('createIncident', { kind: 'server' }, async () => {
     *     return this.incidentRepo.save(incident);
     * });
     */
    async run<T>(
        name: string,
        options: {
            kind?: 'server' | 'client' | 'producer' | 'consumer' | 'internal';
            attributes?: Record<string, string>;
        } = {},
        fn: () => Promise<T>,
    ): Promise<T> {
        const parent = this.als.getStore();
        const traceId = parent?.traceId ?? this.newTraceId();
        const spanId = this.newSpanId();
        const parentSpanId = parent?.spanId ?? null;
        const startNs = this.nowNano();

        return this.als.run({ traceId, spanId }, async () => {
            try {
                const result = await fn();
                this.record({
                    traceId, spanId, parentSpanId, name,
                    startNs, endNs: this.nowNano(),
                    kind: this.kindValue(options.kind ?? 'internal'),
                    statusCode: 1,
                    attributes: options.attributes ?? {},
                });
                return result;
            } catch (error: any) {
                this.record({
                    traceId, spanId, parentSpanId, name,
                    startNs, endNs: this.nowNano(),
                    kind: this.kindValue(options.kind ?? 'internal'),
                    statusCode: 2,
                    attributes: options.attributes ?? {},
                    error: error?.message ?? String(error),
                });
                throw error;
            }
        });
    }

    // ── Interno ───────────────────────────────────────────────────────────────

    private record(span: {
        traceId: string; spanId: string; parentSpanId: string | null; name: string;
        startNs: bigint; endNs: bigint; kind: number; statusCode: number;
        attributes: Record<string, string>; error?: string;
    }): void {
        if (this.buffer.length >= this.MAX_BUFFER) {
            this.droppedCount++;
            return;
        }

        const durationMs = Number((span.endNs - span.startNs) / BigInt(1_000_000));

        this.buffer.push({
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            name: span.name,
            serviceName: this.serviceName,
            correlationId: this.correlationId.getCorrelationId() ?? null,
            kind: span.kind,
            statusCode: span.statusCode,
            startTimeUnixNano: String(span.startNs),
            endTimeUnixNano: String(span.endNs),
            durationMs,
            attributes: span.attributes,
            ...(span.error ? { error: span.error } : {}),
        });

        if (this.buffer.length >= this.BATCH_SIZE) this.doFlush();
    }

    private doFlush(): void {
        if (this.buffer.length === 0 || this.flushing) return;
        this.flushing = true;
        const batch = this.buffer.splice(0, this.BATCH_SIZE);

        this.sendBatch(batch)
            .then(({ ok, failed }) => {
                if (failed > 0) this.logger.warn(`Tracing transport: ${ok} sent, ${failed} dropped`);
                if (this.droppedCount > 0) {
                    this.logger.warn(`Tracing transport: ${this.droppedCount} spans dropped (buffer cap)`);
                    this.droppedCount = 0;
                }
            })
            .catch(() => {})
            .finally(() => { this.flushing = false; });
    }

    private async sendBatch(batch: SpanRecord[]): Promise<{ ok: number; failed: number }> {
        try {
            await this.cb.execute(() => this.http.post(this.url, this.toOtlpEnvelope(batch)));
            return { ok: batch.length, failed: 0 };
        } catch {
            // Falla real o circuito abierto (CircuitBreakerOpenError): batch no enviado.
            return { ok: 0, failed: batch.length };
        }
    }

    /**
     * Construye el envelope OTLP/HTTP JSON que espera el observability-service.
     * Agrupa spans por serviceName para respetar el formato resourceSpans.
     */
    private toOtlpEnvelope(spans: SpanRecord[]): { resourceSpans: any[] } {
        const byService = new Map<string, SpanRecord[]>();
        for (const s of spans) {
            const arr = byService.get(s.serviceName) ?? [];
            arr.push(s);
            byService.set(s.serviceName, arr);
        }

        const resourceSpans = Array.from(byService.entries()).map(([svc, svcSpans]) => ({
            resource: {
                attributes: [
                    { key: 'service.name', value: { stringValue: svc } },
                ],
            },
            scopeSpans: [{
                scope: { name: 'http-tracing', version: '1.0' },
                spans: svcSpans.map(s => ({
                    traceId: s.traceId,
                    spanId: s.spanId,
                    ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
                    name: s.name,
                    kind: s.kind,
                    startTimeUnixNano: s.startTimeUnixNano,
                    endTimeUnixNano: s.endTimeUnixNano,
                    attributes: [
                        ...(s.correlationId
                            ? [{ key: 'correlationId', value: { stringValue: s.correlationId } }]
                            : []),
                        ...(s.error
                            ? [{ key: 'error.message', value: { stringValue: s.error } }]
                            : []),
                        ...Object.entries(s.attributes).map(([k, v]) => ({
                            key: k, value: { stringValue: v },
                        })),
                    ],
                    status: { code: s.statusCode },
                    events: [],
                })),
            }],
        }));

        return { resourceSpans };
    }

    private nowNano(): bigint {
        return BigInt(Date.now()) * BigInt(1_000_000);
    }

    private newTraceId(): string {
        return crypto.randomUUID().replace(/-/g, '');
    }

    private newSpanId(): string {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }

    private kindValue(kind: string): number {
        const map: Record<string, number> = {
            internal: 1, server: 2, client: 3, producer: 4, consumer: 5,
        };
        return map[kind] ?? 1;
    }
}
