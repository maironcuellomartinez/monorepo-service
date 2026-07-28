// eslint-disable-next-line @typescript-eslint/no-require-imports
const Transport = require('winston-transport') as typeof import('winston-transport');
import { Logger } from '@nestjs/common';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';

export interface LogInfo {
    timestamp: string;
    level: string;
    message: string;
    correlationId?: string;
    context?: string;
    service?: string;
    stack?: any;
    [key: string]: any;
}

/** Contexts del logger interno de Nest (boot: InstanceLoader, RoutesResolver, RouterExplorer, etc.) — puro ruido de arranque, nunca se envían por HTTP. */
const NEST_INTERNAL_CONTEXTS = new Set([
    'NestFactory',
    'InstanceLoader',
    'RoutesResolver',
    'RouterExplorer',
    'NestApplication',
    'NestMicroservice',
    'WebSocketsController',
]);

/** Describe por qué falló un envío HTTP: código de red, status, o mensaje crudo. */
function describeSendError(err: unknown): string {
    const e = err as { code?: string; message?: string; response?: { status?: number } };
    if (e?.response?.status) return `status=${e.response.status}`;
    if (e?.code) return e.code;
    return e?.message ?? String(err);
}

class TransportCircuitBreaker {
    private failures = 0;
    private openUntil = 0;
    constructor(
        private readonly threshold = 5,
        private readonly resetMs = 30_000,
        private readonly logger: Logger,
    ) {}

    get isOpen(): boolean {
        if (this.failures < this.threshold) return false;
        if (Date.now() >= this.openUntil) {
            this.failures = 0;
            this.logger.log('Log transport circuit breaker: CLOSED (recovered)');
            return false;
        }
        return true;
    }
    recordSuccess() { this.failures = 0; }
    recordFailure() {
        this.failures++;
        if (this.failures === this.threshold) {
            this.openUntil = Date.now() + this.resetMs;
            this.logger.warn(`Log transport circuit breaker: OPEN — pausing ${this.resetMs / 1000}s`);
        }
    }
}

/**
 * Winston transport HTTP para abac-microservice → observability-service.
 *
 * Reemplaza WinstonRabbitMQTransport (cuyo publishLog era un no-op).
 *
 * Env vars:
 *   LOG_TRANSPORT_URL      — default: http://localhost:3099/ingest/logs
 *   LOG_TRANSPORT_LEVEL    — default: warn
 *   LOG_TRANSPORT_BATCH    — default: 50
 *   LOG_TRANSPORT_INTERVAL — default: 2000
 *   SERVICE_NAME           — default: abac-microservice
 */
export class WinstonHttpTransport extends Transport {
    private readonly logger = new Logger(WinstonHttpTransport.name);
    private buffer: LogInfo[] = [];
    private droppedCount = 0;
    private flushing = false;

    private readonly BATCH_SIZE: number;
    private readonly FLUSH_INTERVAL_MS: number;
    private readonly MAX_BUFFER = 2_000;
    private readonly url: string;
    private readonly minLevel: string;
    private readonly timer: NodeJS.Timeout;

    private readonly agent: Agent;
    private readonly http: AxiosInstance;
    private readonly cb: TransportCircuitBreaker;

    private static readonly LEVEL_ORDER: Record<string, number> = {
        error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6,
    };

    constructor() {
        super();
        this.BATCH_SIZE = parseInt(process.env.LOG_TRANSPORT_BATCH ?? '50', 10);
        this.FLUSH_INTERVAL_MS = parseInt(process.env.LOG_TRANSPORT_INTERVAL ?? '2000', 10);
        this.url = process.env.LOG_TRANSPORT_URL ?? 'http://localhost:3099/ingest/logs';
        this.minLevel = process.env.LOG_TRANSPORT_LEVEL ?? 'warn';

        this.agent = new Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2 });
        this.http = axios.create({
            httpAgent: this.agent,
            timeout: 1_500,
            headers: {
                'Content-Type': 'application/json',
                'x-service-name': process.env.SERVICE_NAME ?? 'abac-microservice',
            },
        });

        this.cb = new TransportCircuitBreaker(5, 30_000, this.logger);
        this.timer = setInterval(() => this.doFlush(), this.FLUSH_INTERVAL_MS);
    }

    log(info: LogInfo, callback: () => void): void {
        if (info.context && NEST_INTERNAL_CONTEXTS.has(info.context)) {
            callback();
            return;
        }

        const incomingOrder = WinstonHttpTransport.LEVEL_ORDER[info.level] ?? 99;
        const minOrder = WinstonHttpTransport.LEVEL_ORDER[this.minLevel] ?? 2;

        if (incomingOrder > minOrder) {
            callback();
            return;
        }

        if (this.buffer.length >= this.MAX_BUFFER) {
            this.droppedCount++;
            callback();
            return;
        }

        this.buffer.push({
            timestamp: info.timestamp ?? new Date().toISOString(),
            level: info.level,
            message: typeof info.message === 'object'
                ? JSON.stringify(info.message)
                : String(info.message),
            correlationId: info.correlationId,
            context: info.context,
            service: info.service ?? process.env.SERVICE_NAME ?? 'abac-microservice',
            ...(info.stack ? { stack: info.stack } : {}),
        });

        if (this.buffer.length >= this.BATCH_SIZE) this.doFlush();
        callback();
    }

    private doFlush(): void {
        if (this.buffer.length === 0 || this.flushing) return;
        this.flushing = true;
        const batch = this.buffer.splice(0, this.BATCH_SIZE);

        this.send(batch)
            .then(({ ok, failed, error }) => {
                if (failed > 0) this.logger.warn(`Log transport: ${ok} sent, ${failed} dropped (${error})`);
                if (this.droppedCount > 0) {
                    this.logger.warn(`Log transport: ${this.droppedCount} logs dropped (buffer cap)`);
                    this.droppedCount = 0;
                }
            })
            // send() nunca rechaza (atrapa sus propios errores) — este catch cubre solo un
            // bug inesperado en el .then() de arriba, y no debe quedar en silencio total.
            .catch((error: unknown) => {
                this.logger.error(`Log transport: fallo inesperado en doFlush(): ${(error as Error).message}`);
            })
            .finally(() => { this.flushing = false; });
    }

    private async send(batch: LogInfo[]): Promise<{ ok: number; failed: number; error?: string }> {
        if (this.cb.isOpen) return { ok: 0, failed: batch.length, error: 'circuit breaker open' };
        try {
            await this.http.post(this.url, { logs: batch, batchSize: batch.length });
            this.cb.recordSuccess();
            return { ok: batch.length, failed: 0 };
        } catch (err) {
            this.cb.recordFailure();
            return { ok: 0, failed: batch.length, error: describeSendError(err) };
        }
    }

    shutdown(): void {
        clearInterval(this.timer);
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.BATCH_SIZE);
            this.send(batch).catch((error: unknown) => {
                this.logger.error(`Log transport: fallo inesperado en shutdown(): ${(error as Error).message}`);
            });
        }
        this.agent.destroy();
    }
}
