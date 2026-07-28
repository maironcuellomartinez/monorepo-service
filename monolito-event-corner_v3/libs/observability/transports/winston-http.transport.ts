import Transport from 'winston-transport';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';
import {
  CircuitBreaker,
  CircuitBreakerState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from '@backendkit-labs/circuit-breaker';

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

export type LogInfoLevel = 'info' | 'error' | 'warn' | 'debug' | 'verbose';

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

/**
 * Winston transport que envía logs via HTTP POST a un endpoint.
 *
 * Mejoras vs fetch original:
 * - Keep-alive: reutiliza conexión TCP (axios + http.Agent)
 * - Circuit breaker (@backendkit-labs/circuit-breaker): ventana deslizante,
 *   abre al ≥60% de fallos y para de intentar 30s
 * - Buffer cap: descarta nuevos logs si el buffer supera MAX_BUFFER (evita OOM)
 * - Filtro de nivel: solo envía logs >= minLevel por HTTP (default: warn)
 * - splice en lugar de spread: no recrea el array completo en cada flush
 *
 * Env vars:
 *   LOG_TRANSPORT_ENABLED  — false para desactivar el envío HTTP por completo (default: true)
 *   LOG_TRANSPORT_URL      — endpoint HTTP (default: http://localhost:3099/ingest/logs)
 *   LOG_TRANSPORT_BATCH    — max logs por batch (default: 50)
 *   LOG_TRANSPORT_INTERVAL — ms entre flush (default: 2000)
 *   LOG_TRANSPORT_LEVEL    — nivel mínimo para HTTP (default: warn)
 */
export class WinstonHttpTransport extends Transport implements OnModuleDestroy {
  private readonly logger = new Logger(WinstonHttpTransport.name);
  private buffer: LogInfo[] = [];
  private droppedCount = 0;

  private readonly enabled: boolean;
  private readonly BATCH_SIZE: number;
  private readonly FLUSH_INTERVAL_MS: number;
  private readonly MAX_BUFFER = 2_000;
  private readonly url: string;
  private readonly minLevel: string;
  private readonly timer?: NodeJS.Timeout;
  private flushing = false;

  private readonly agent: Agent;
  private readonly axiosInstance: AxiosInstance;
  private readonly cb: CircuitBreaker;

  private static readonly LEVEL_ORDER: Record<string, number> = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
  };

  constructor(
    options: {
      batchSize?: number;
      flushIntervalMs?: number;
      url?: string;
      minLevel?: string;
    } = {},
  ) {
    super();

    this.enabled = process.env.LOG_TRANSPORT_ENABLED !== 'false';
    this.BATCH_SIZE =
      options.batchSize ??
      parseInt(process.env.LOG_TRANSPORT_BATCH ?? '50', 10);
    this.FLUSH_INTERVAL_MS =
      options.flushIntervalMs ??
      parseInt(process.env.LOG_TRANSPORT_INTERVAL ?? '2000', 10);
    this.url =
      options.url ??
      process.env.LOG_TRANSPORT_URL ??
      'http://localhost:3099/ingest/logs';
    this.minLevel =
      options.minLevel ?? process.env.LOG_TRANSPORT_LEVEL ?? 'warn';

    this.agent = new Agent({
      keepAlive: true,
      maxSockets: 2,
      maxFreeSockets: 2,
    });

    const m2mToken = process.env.OBS_M2M_TOKEN ?? process.env.ABAC_M2M_TOKEN;
    this.axiosInstance = axios.create({
      httpAgent: this.agent,
      timeout: 1_500,
      headers: {
        'Content-Type': 'application/json',
        'x-service-name': process.env.SERVICE_NAME ?? 'unknown',
        ...(m2mToken ? { Authorization: `Bearer ${m2mToken}` } : {}),
      },
    });

    this.cb = new CircuitBreaker({
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      name: 'obs-log-transport',
      failureThreshold: 60,
      slidingWindowSize: 5,
      minimumCalls: 3,
      halfOpenMaxCalls: 1,
      openTimeoutMs: 30_000,
      onStateChange: (_from, to) => {
        if (to === CircuitBreakerState.OPEN) {
          this.logger.warn(
            'Log transport circuit breaker: OPEN — skipping sends for 30s',
          );
        } else if (to === CircuitBreakerState.CLOSED) {
          this.logger.log('Log transport circuit breaker: CLOSED (recovered)');
        }
      },
    });

    this.timer = this.enabled
      ? setInterval(() => this.doFlush(), this.FLUSH_INTERVAL_MS)
      : undefined;
  }

  /**
   * Envía un log al endpoint HTTP.
   * @param info Información del log.
   * @param callback Callback a ejecutar después de enviar el log.
   */
  log(info: LogInfo, callback: () => void): void {
    if (!this.enabled || (info.context && NEST_INTERNAL_CONTEXTS.has(info.context)) || !this.shouldSend(info.level)) {
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
      message:
        typeof info.message === 'object'
          ? JSON.stringify(info.message)
          : String(info.message),
      correlationId: info.correlationId,
      traceId: info.traceId,
      spanId: info.spanId,
      context: info.context,
      service: info.service,
      ...(info.stack ? { stack: info.stack } : {}),
    };

    this.buffer.push(entry);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.doFlush();
    }

    callback();
  }

  /**
   * Verifica si el nivel del log es mayor o igual al nivel mínimo configurado.
   * @param level Nivel del log.
   * @returns True si el nivel del log es mayor o igual al nivel mínimo configurado, false en caso contrario.
   */
  private shouldSend(level: string): boolean {
    const incomingOrder = WinstonHttpTransport.LEVEL_ORDER[level] ?? 99;
    const minOrder = WinstonHttpTransport.LEVEL_ORDER[this.minLevel] ?? 1;
    return incomingOrder <= minOrder;
  }

  /**
   * Envía el lote de logs al endpoint HTTP.
   * @returns Objeto con el número de logs enviados y fallidos.
   */
  private doFlush(): void {
    if (this.buffer.length === 0 || this.flushing) return;
    this.flushing = true;

    const batch = this.buffer.splice(0, this.BATCH_SIZE);
    const cbOpen = this.cb.getState() === CircuitBreakerState.OPEN;

    this.send(batch)
      .then(({ ok, failed, error }) => {
        // No loguear fallo si el CB ya está abierto — el onStateChange ya avisó
        if (failed > 0 && !cbOpen) {
          this.logger.warn(
            `Log transport: ${ok} sent, ${failed} failed (${error})`,
          );
        }
        if (this.droppedCount > 0) {
          this.logger.warn(
            `Log transport: ${this.droppedCount} logs discarded (buffer cap reached)`,
          );
          this.droppedCount = 0;
        }
      })
      .catch(() => {})
      .finally(() => {
        this.flushing = false;
      });
  }

  /**
   * Envía un lote de logs al endpoint HTTP.
   * @param batch Lote de logs a enviar.
   * @returns Objeto con el número de logs enviados y fallidos.
   */
  private async send(
    batch: LogInfo[],
  ): Promise<{ ok: number; failed: number; error?: string }> {
    try {
      await this.cb.execute(() =>
        this.axiosInstance.post(this.url, {
          logs: batch,
          batchSize: batch.length,
        }),
      );
      return { ok: batch.length, failed: 0 };
    } catch (err) {
      // Falla real o circuito abierto (CircuitBreakerOpenError): batch no enviado.
      return { ok: 0, failed: batch.length, error: describeSendError(err) };
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.BATCH_SIZE);
      this.send(batch).catch(() => {});
    }
    this.agent.destroy();
  }
}
