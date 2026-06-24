import Transport from 'winston-transport';
import { Logger } from '@nestjs/common';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';

export interface LogInfo {
    timestamp: string;
    level: string;
    message: string;
    correlationId?: string;
    traceId?: string;
    spanId?: string;
    context?: string;
    service?: string;
    stack?: any;
    [key: string]: any;
}

/**
 * Circuit breaker mínimo inline.
 * CLOSED → (5 fallos consecutivos) → OPEN → (30s) → CLOSED
 */
class TransportCircuitBreaker {
    private failures = 0;
    private openUntil = 0;
    private readonly threshold: number;
    private readonly resetMs: number;
    private readonly logger: Logger;

    constructor(threshold = 5, resetMs = 30_000, loggerRef: Logger) {
        this.threshold = threshold;
        this.resetMs = resetMs;
        this.logger = loggerRef;
    }

    get isOpen(): boolean {
        if (this.failures < this.threshold) return false;
        if (Date.now() >= this.openUntil) {
            this.failures = 0;
            this.logger.log('Log transport circuit breaker: CLOSED (recovered)');
            return false;
        }
        return true;
    }

    recordSuccess(): void {
        this.failures = 0;
    }

    recordFailure(): void {
        this.failures++;
        if (this.failures === this.threshold) {
            this.openUntil = Date.now() + this.resetMs;
            this.logger.warn(
                `Log transport circuit breaker: OPEN — skipping sends for ${this.resetMs / 1000}s`,
            );
        }
    }
}

/**
 * Winston transport que envía logs via HTTP POST al observability-service.
 *
 * - Keep-alive: reutiliza conexión TCP (axios + http.Agent)
 * - Circuit breaker: tras 5 fallos consecutivos para de intentar 30s
 * - Buffer cap: descarta nuevos logs si el buffer supera MAX_BUFFER (evita OOM)
 * - Filtro de nivel: solo envía logs >= minLevel por HTTP (default: warn)
 *
 * Env vars:
 *   LOG_TRANSPORT_URL      — endpoint HTTP (default: http://localhost:3099/ingest/logs)
 *   LOG_TRANSPORT_BATCH    — max logs por batch (default: 50)
 *   LOG_TRANSPORT_INTERVAL — ms entre flush (default: 2000)
 *   LOG_TRANSPORT_LEVEL    — nivel mínimo para HTTP (default: warn)
 *   SERVICE_NAME           — nombre del servicio en los logs (default: api-snowq-service)
 */
export class WinstonHttpTransport extends Transport {
    private readonly logger = new Logger(WinstonHttpTransport.name);
    private buffer: LogInfo[] = [];
    private droppedCount = 0;

    private readonly BATCH_SIZE: number;
    private readonly FLUSH_INTERVAL_MS: number;
    private readonly MAX_BUFFER = 2_000;
    private readonly url: string;
    private readonly minLevel: string;
    private readonly timer: NodeJS.Timeout;
    private flushing = false;

    private readonly agent: Agent;
    private readonly axiosInstance: AxiosInstance;
    private readonly cb: TransportCircuitBreaker;

    private static readonly LEVEL_ORDER: Record<string, number> = {
        error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6,
    };

    constructor(options: {
        batchSize?: number;
        flushIntervalMs?: number;
        url?: string;
        minLevel?: string;
    } = {}) {
        super();

        this.BATCH_SIZE = options.batchSize
            ?? parseInt(process.env.LOG_TRANSPORT_BATCH ?? '50', 10);
        this.FLUSH_INTERVAL_MS = options.flushIntervalMs
            ?? parseInt(process.env.LOG_TRANSPORT_INTERVAL ?? '2000', 10);
        this.url = options.url
            ?? process.env.LOG_TRANSPORT_URL
            ?? 'http://localhost:3099/ingest/logs';
        this.minLevel = options.minLevel
            ?? process.env.LOG_TRANSPORT_LEVEL
            ?? 'warn';

        this.agent = new Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2 });

        this.axiosInstance = axios.create({
            httpAgent: this.agent,
            timeout: 1_500,
            headers: {
                'Content-Type': 'application/json',
                'x-service-name': process.env.SERVICE_NAME ?? 'api-snowq-service',
            },
        });

        this.cb = new TransportCircuitBreaker(5, 30_000, this.logger);

        this.timer = setInterval(() => this.doFlush(), this.FLUSH_INTERVAL_MS);
    }

    log(info: LogInfo, callback: () => void): void {
        if (!this.shouldSend(info.level)) {
            callback();
            return;
        }

        if (this.buffer.length >= this.MAX_BUFFER) {
            this.droppedCount++;
            callback();
            return;
        }

        const entry: LogInfo = {
            timestamp: info.timestamp ?? new Date().toISOString(),
            level: info.level,
            message: typeof info.message === 'object'
                ? JSON.stringify(info.message)
                : String(info.message),
            correlationId: info.correlationId,
            traceId: info.traceId,
            spanId: info.spanId,
            context: info.context,
            service: info.service ?? process.env.SERVICE_NAME ?? 'api-snowq-service',
            ...(info.stack ? { stack: info.stack } : {}),
        };

        this.buffer.push(entry);

        if (this.buffer.length >= this.BATCH_SIZE) {
            this.doFlush();
        }

        callback();
    }

    private shouldSend(level: string): boolean {
        const incomingOrder = WinstonHttpTransport.LEVEL_ORDER[level] ?? 99;
        const minOrder = WinstonHttpTransport.LEVEL_ORDER[this.minLevel] ?? 1;
        return incomingOrder <= minOrder;
    }

    private doFlush(): void {
        if (this.buffer.length === 0 || this.flushing) return;
        this.flushing = true;

        const batch = this.buffer.splice(0, this.BATCH_SIZE);

        this.send(batch)
            .then(({ ok, failed }) => {
                if (failed > 0) {
                    this.logger.warn(`Log transport: ${ok} sent, ${failed} dropped`);
                }
                if (this.droppedCount > 0) {
                    this.logger.warn(`Log transport: ${this.droppedCount} logs dropped (buffer cap)`);
                    this.droppedCount = 0;
                }
            })
            .catch(() => { })
            .finally(() => { this.flushing = false; });
    }

    private async send(batch: LogInfo[]): Promise<{ ok: number; failed: number }> {
        if (this.cb.isOpen) return { ok: 0, failed: batch.length };

        try {
            await this.axiosInstance.post(this.url, { logs: batch, batchSize: batch.length });
            this.cb.recordSuccess();
            return { ok: batch.length, failed: 0 };
        } catch {
            this.cb.recordFailure();
            return { ok: 0, failed: batch.length };
        }
    }

    shutdown(): void {
        clearInterval(this.timer);
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.BATCH_SIZE);
            this.send(batch).catch(() => { });
        }
        this.agent.destroy();
    }
}
