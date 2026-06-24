import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';

interface TraceContext {
    traceId: string;
    spanId: string;
}

interface SpanRecord {
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    name: string;
    correlationId: string | null;
    kind: number;
    statusCode: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    durationMs: number;
    attributes: Record<string, string>;
    error?: string;
}

class CB {
    private failures = 0;
    private openUntil = 0;
    constructor(private readonly t = 5, private readonly r = 30_000, private readonly l: Logger) {}
    get isOpen() {
        if (this.failures < this.t) return false;
        if (Date.now() >= this.openUntil) { this.failures = 0; return false; }
        return true;
    }
    ok() { this.failures = 0; }
    fail() {
        this.failures++;
        if (this.failures === this.t) {
            this.openUntil = Date.now() + this.r;
            this.l.warn(`Tracing CB: OPEN ${this.r / 1000}s`);
        }
    }
}

/**
 * Cliente de tracing HTTP-direct para api-snowq-service.
 * Singleton — obtener via TracingClient.getInstance().
 *
 * Env vars:
 *   OBS_TRACES_URL  — default: http://localhost:3099/ingest/traces
 *   SERVICE_NAME    — default: api-snowq-service
 */
export class TracingClient {
    private static instance: TracingClient;
    private static readonly logger = new Logger(TracingClient.name);

    private readonly als = new AsyncLocalStorage<TraceContext>();
    private readonly buffer: SpanRecord[] = [];
    private droppedCount = 0;
    private flushing = false;

    private readonly BATCH = 50;
    private readonly MAX = 2_000;
    private readonly url: string;
    private readonly serviceName: string;
    private readonly agent: Agent;
    private readonly http: AxiosInstance;
    private readonly cb: CB;
    private readonly timer: NodeJS.Timeout;

    private constructor() {
        this.url = process.env.OBS_TRACES_URL ?? 'http://localhost:3099/ingest/traces';
        this.serviceName = process.env.SERVICE_NAME ?? 'api-snowq-service';

        this.agent = new Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2 });
        this.http = axios.create({
            httpAgent: this.agent,
            timeout: 1_500,
            headers: { 'Content-Type': 'application/json' },
        });

        this.cb = new CB(5, 30_000, TracingClient.logger);
        this.timer = setInterval(() => this.doFlush(), 2_000);
    }

    static getInstance(): TracingClient {
        if (!TracingClient.instance) TracingClient.instance = new TracingClient();
        return TracingClient.instance;
    }

    getTraceId(): string | undefined { return this.als.getStore()?.traceId; }
    getSpanId(): string | undefined { return this.als.getStore()?.spanId; }

    async run<T>(
        name: string,
        options: {
            kind?: 'server' | 'client' | 'producer' | 'consumer' | 'internal';
            attributes?: Record<string, string>;
            correlationId?: string;
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
                this.push({ traceId, spanId, parentSpanId, name, startNs, endNs: this.nowNano(),
                    kind: this.kindVal(options.kind ?? 'internal'), statusCode: 1,
                    attributes: options.attributes ?? {}, correlationId: options.correlationId ?? null });
                return result;
            } catch (error: any) {
                this.push({ traceId, spanId, parentSpanId, name, startNs, endNs: this.nowNano(),
                    kind: this.kindVal(options.kind ?? 'internal'), statusCode: 2,
                    attributes: options.attributes ?? {}, correlationId: options.correlationId ?? null,
                    error: error?.message ?? String(error) });
                throw error;
            }
        });
    }

    private push(s: { traceId: string; spanId: string; parentSpanId: string | null; name: string;
        startNs: bigint; endNs: bigint; kind: number; statusCode: number;
        attributes: Record<string, string>; correlationId: string | null; error?: string }): void {
        if (this.buffer.length >= this.MAX) { this.droppedCount++; return; }
        this.buffer.push({
            traceId: s.traceId, spanId: s.spanId, parentSpanId: s.parentSpanId,
            name: s.name, correlationId: s.correlationId, kind: s.kind, statusCode: s.statusCode,
            startTimeUnixNano: String(s.startNs), endTimeUnixNano: String(s.endNs),
            durationMs: Number((s.endNs - s.startNs) / BigInt(1_000_000)),
            attributes: s.attributes, ...(s.error ? { error: s.error } : {}),
        });
        if (this.buffer.length >= this.BATCH) this.doFlush();
    }

    private doFlush(): void {
        if (this.buffer.length === 0 || this.flushing) return;
        this.flushing = true;
        const batch = this.buffer.splice(0, this.BATCH);
        this.send(batch)
            .then(({ ok, failed }) => {
                if (failed > 0) TracingClient.logger.warn(`Tracing: ${ok} sent, ${failed} dropped`);
                if (this.droppedCount > 0) {
                    TracingClient.logger.warn(`Tracing: ${this.droppedCount} spans dropped`);
                    this.droppedCount = 0;
                }
            })
            .catch(() => {})
            .finally(() => { this.flushing = false; });
    }

    private async send(batch: SpanRecord[]): Promise<{ ok: number; failed: number }> {
        if (this.cb.isOpen) return { ok: 0, failed: batch.length };
        try {
            await this.http.post(this.url, this.toOtlp(batch));
            this.cb.ok();
            return { ok: batch.length, failed: 0 };
        } catch {
            this.cb.fail();
            return { ok: 0, failed: batch.length };
        }
    }

    private toOtlp(spans: SpanRecord[]): { resourceSpans: any[] } {
        return {
            resourceSpans: [{
                resource: {
                    attributes: [{ key: 'service.name', value: { stringValue: this.serviceName } }],
                },
                scopeSpans: [{
                    scope: { name: 'http-tracing', version: '1.0' },
                    spans: spans.map(s => ({
                        traceId: s.traceId, spanId: s.spanId,
                        ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
                        name: s.name, kind: s.kind,
                        startTimeUnixNano: s.startTimeUnixNano,
                        endTimeUnixNano: s.endTimeUnixNano,
                        attributes: [
                            ...(s.correlationId ? [{ key: 'correlationId', value: { stringValue: s.correlationId } }] : []),
                            ...(s.error ? [{ key: 'error.message', value: { stringValue: s.error } }] : []),
                            ...Object.entries(s.attributes).map(([k, v]) => ({ key: k, value: { stringValue: v } })),
                        ],
                        status: { code: s.statusCode },
                        events: [],
                    })),
                }],
            }],
        };
    }

    private nowNano(): bigint { return BigInt(Date.now()) * BigInt(1_000_000); }
    private newTraceId(): string { return crypto.randomUUID().replace(/-/g, ''); }
    private newSpanId(): string { return crypto.randomUUID().replace(/-/g, '').slice(0, 16); }
    private kindVal(k: string): number {
        return ({ internal: 1, server: 2, client: 3, producer: 4, consumer: 5 } as any)[k] ?? 1;
    }

    shutdown(): void {
        clearInterval(this.timer);
        while (this.buffer.length > 0) {
            this.send(this.buffer.splice(0, this.BATCH)).catch(() => {});
        }
        this.agent.destroy();
    }
}
