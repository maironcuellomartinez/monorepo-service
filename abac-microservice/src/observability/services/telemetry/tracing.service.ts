import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';
import { CorrelationIdService } from '../correlation-id.service';

/** Describe por qué falló un envío HTTP: código de red, status, o mensaje crudo. */
function describeSendError(err: unknown): string {
    const e = err as { code?: string; message?: string; response?: { status?: number } };
    if (e?.response?.status) return `status=${e.response.status}`;
    if (e?.code) return e.code;
    return e?.message ?? String(err);
}

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
    correlationId: string | undefined;
    kind: number;
    statusCode: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    durationMs: number;
    attributes: Record<string, string>;
    error?: string;
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
            this.logger?.warn(`Tracing circuit breaker: OPEN ${this.resetMs / 1000}s`);
        }
    }
}

/**
 * Tracing HTTP-direct — envía spans a observability-service en formato OTLP/HTTP JSON.
 * No requiere OTel SDK (reemplaza al stub no-op previo, ver otel.sdk.ts).
 * Propaga traceId/spanId via AsyncLocalStorage; correlationId se autolee de
 * CorrelationIdService en cada span, sin que el llamador tenga que pasarlo.
 *
 * Env vars:
 *   OBS_TRACES_URL       — default: http://localhost:3099/ingest/traces
 *   OBS_TRACES_BATCH     — max spans por batch (default: 50)
 *   OBS_TRACES_INTERVAL  — ms entre flush (default: 2000)
 *   SERVICE_NAME         — default: abac-microservice
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
    private readonly serviceName: string;
    private readonly timer: NodeJS.Timeout;

    private readonly agent: Agent;
    private readonly http: AxiosInstance;
    private readonly cb: SimpleCircuitBreaker;

    constructor(private readonly correlationId: CorrelationIdService) {
        this.BATCH_SIZE = parseInt(process.env.OBS_TRACES_BATCH ?? '50', 10);
        this.FLUSH_INTERVAL_MS = parseInt(process.env.OBS_TRACES_INTERVAL ?? '2000', 10);
        this.url = process.env.OBS_TRACES_URL ?? 'http://localhost:3099/ingest/traces';
        this.serviceName = process.env.SERVICE_NAME ?? 'abac-microservice';

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
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.BATCH_SIZE);
            this.sendBatch(batch).catch(() => {});
        }
        this.agent.destroy();
    }

    getTraceId(): string | undefined {
        return this.als.getStore()?.traceId;
    }

    getSpanId(): string | undefined {
        return this.als.getStore()?.spanId;
    }

    /**
     * Ejecuta fn dentro de un span. Propaga traceId a spans hijos.
     *
     * @example
     * return this.tracing.run('abac.canAccess', { kind: 'internal', attributes: {...} }, async () => {
     *     return this.evaluate(...);
     * });
     */
    async run<T>(
        name: string,
        options: {
            kind?: 'server' | 'client' | 'producer' | 'consumer' | 'internal';
            attributes?: Record<string, string | number | boolean>;
        } = {},
        fn: () => Promise<T>,
    ): Promise<T> {
        const parent = this.als.getStore();
        const traceId = parent?.traceId ?? this.newTraceId();
        const spanId = this.newSpanId();
        const parentSpanId = parent?.spanId ?? null;
        const startNs = this.nowNano();
        const attributes = this.stringifyAttributes(options.attributes);

        return this.als.run({ traceId, spanId }, async () => {
            try {
                const result = await fn();
                this.record({
                    traceId, spanId, parentSpanId, name,
                    startNs, endNs: this.nowNano(),
                    kind: this.kindValue(options.kind ?? 'internal'),
                    statusCode: 1,
                    attributes,
                });
                return result;
            } catch (error: any) {
                this.record({
                    traceId, spanId, parentSpanId, name,
                    startNs, endNs: this.nowNano(),
                    kind: this.kindValue(options.kind ?? 'internal'),
                    statusCode: 2,
                    attributes,
                    error: error?.message ?? String(error),
                });
                throw error;
            }
        });
    }

    /**
     * Crea un span hijo manual sin envolver una función (casos avanzados).
     * A diferencia de run(), el llamador es responsable de invocar end().
     */
    startChildSpan(name: string, attributes?: Record<string, string | number | boolean>): { end: () => void } {
        const parent = this.als.getStore();
        const traceId = parent?.traceId ?? this.newTraceId();
        const spanId = this.newSpanId();
        const parentSpanId = parent?.spanId ?? null;
        const startNs = this.nowNano();
        const attrs = this.stringifyAttributes(attributes);

        return {
            end: () => this.record({
                traceId, spanId, parentSpanId, name,
                startNs, endNs: this.nowNano(),
                kind: this.kindValue('internal'),
                statusCode: 1,
                attributes: attrs,
            }),
        };
    }

    private stringifyAttributes(attrs?: Record<string, string | number | boolean>): Record<string, string> {
        if (!attrs) return {};
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(attrs)) result[k] = String(v);
        return result;
    }

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
            correlationId: this.correlationId.getCorrelationId(),
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
            .then(({ ok, failed, error }) => {
                if (failed > 0) this.logger.warn(`Tracing transport: ${ok} sent, ${failed} dropped (${error})`);
                if (this.droppedCount > 0) {
                    this.logger.warn(`Tracing transport: ${this.droppedCount} spans dropped (buffer cap)`);
                    this.droppedCount = 0;
                }
            })
            .catch(() => {})
            .finally(() => { this.flushing = false; });
    }

    private async sendBatch(batch: SpanRecord[]): Promise<{ ok: number; failed: number; error?: string }> {
        if (this.cb.isOpen) return { ok: 0, failed: batch.length, error: 'circuit breaker open' };
        try {
            await this.http.post(this.url, this.toOtlpEnvelope(batch));
            this.cb.ok();
            return { ok: batch.length, failed: 0 };
        } catch (err) {
            this.cb.fail();
            return { ok: 0, failed: batch.length, error: describeSendError(err) };
        }
    }

    private toOtlpEnvelope(spans: SpanRecord[]): { resourceSpans: any[] } {
        const byService = new Map<string, SpanRecord[]>();
        for (const s of spans) {
            const arr = byService.get(s.serviceName) ?? [];
            arr.push(s);
            byService.set(s.serviceName, arr);
        }
        const resourceSpans = Array.from(byService.entries()).map(([svc, svcSpans]) => ({
            resource: {
                attributes: [{ key: 'service.name', value: { stringValue: svc } }],
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
                        ...(s.correlationId ? [{ key: 'correlationId', value: { stringValue: s.correlationId } }] : []),
                        ...(s.error ? [{ key: 'error.message', value: { stringValue: s.error } }] : []),
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
        const map: Record<string, number> = { internal: 1, server: 2, client: 3, producer: 4, consumer: 5 };
        return map[kind] ?? 1;
    }
}
