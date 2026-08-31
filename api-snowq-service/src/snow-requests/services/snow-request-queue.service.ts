import { Injectable, OnModuleInit, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreakerOpenError } from '@backendkit-labs/circuit-breaker';
import PQueue from 'p-queue';
import { SnowRequestEntity } from '../entities/snow-request.entity';
import { SnowRequestService } from './snow-request.service';
import {
    CorrelationIdService,
    LoggerService,
    ObsMetricsClient,
    TracingClient,
    RequestPriority,
    RequestType,
    ServiceNowTemporalError,
} from '../../common';
import { SnowRequestProcessorFactory } from 'src/servicenow/processors/processor.factory';
import { BulkheadRegistry } from 'src/resilience/bulkhead/bulkhead.registry';

/**
 * Cola global única hacia ServiceNow.
 *
 * Una sola PQueue (concurrency=5) controla cuántas llamadas simultáneas
 * llegan a SN. Cada tarea se encola con una prioridad calculada por tipo
 * y nivel. Mayor número = se despacha antes.
 *
 * Orden de despacho (base por tipo + offset por nivel):
 *
 *   Tipo            Base   CRITICAL  HIGH  MEDIUM  LOW
 *   ──────────────────────────────────────────────────
 *   incident         400     404     403    402    401   ← primero siempre
 *   change_request   300     304     303    302    301   ← segundo
 *   problem          200     204     203    202    201
 *   sc_req_item      200     204     203    202    201
 *   kb_article       100     104     103    102    101
 *   release_task     100     104     103    102    101
 *   cmdb_ci          100     104     103    102    101   ← último
 *
 * Retry con backoff: en caso de error, markAsRetry() reencola el registro
 * en la DB con nextRetryAt = now + delay(priority). Si agota maxRetries → FAILED.
 */
@Injectable()
export class SnowRequestQueueService implements OnModuleInit, OnModuleDestroy {

    private readonly snowQueue = new PQueue({ concurrency: 5 });
    private readonly metrics = ObsMetricsClient.getInstance();
    private readonly tracing = TracingClient.getInstance();
    private metricsInterval?: NodeJS.Timeout;

    /**
     * Tope del backlog en memoria (size + pending de la PQueue). El worker
     * (SnowRequestWorkerService) consulta `isBacklogFull()` antes de leer más
     * filas QUEUED de la DB — sin este freno, una tormenta de alertas mueve
     * la tabla entera a memoria en segundos porque nada frena al worker
     * mientras haya filas QUEUED (ver M-12 en la auditoría de 2026-08-31).
     */
    private static readonly MAX_BACKLOG = parseInt(process.env.SNOWQ_MAX_BACKLOG ?? '500', 10);

    // Pico de tamaño/pendientes desde el último reporte — un poll puntual cada 15s
    // sobre snowQueue.size/.pending casi siempre lee 0 (el backlog dura milisegundos,
    // muy por debajo del intervalo de muestreo). Se trackea el máximo visto entre
    // reportes enganchando los eventos 'add'/'active' de p-queue (se disparan justo
    // cuando .size/.pending cambian), no un valor puntual al momento del poll.
    private peakSize = 0;
    private peakPending = 0;

    private static readonly TYPE_BASE: Partial<Record<RequestType, number>> = {
        [RequestType.INCIDENT]:            400,
        [RequestType.CHANGE_REQUEST]:      300,
        [RequestType.PROBLEM]:             200,
        [RequestType.SERVICE_CATALOG]:     200,
        [RequestType.KNOWLEDGE_ARTICLE]:   100,
        [RequestType.RELEASE_TASK]:        100,
        [RequestType.CONFIGURATION_ITEM]:  100,
    };

    constructor(
        private readonly processorFactory: SnowRequestProcessorFactory,
        private readonly snowRequestService: SnowRequestService,
        private readonly correlationIdService: CorrelationIdService,
        private readonly logger: LoggerService,
        private readonly bulkheadRegistry: BulkheadRegistry,
    ) { }

    onModuleInit() {
        this.logger.log('Cola global hacia ServiceNow inicializada [concurrency=5, orden: incident > change_request > resto]');

        this.snowQueue.on('add', () => this.trackQueuePeaks());
        this.snowQueue.on('active', () => this.trackQueuePeaks());

        // Gauges periódicos: pico de backlog y de concurrencia real desde el último reporte.
        // Handle guardado y limpiado en onModuleDestroy — antes quedaba corriendo
        // indefinidamente tras el shutdown del módulo (los propios tests de este
        // servicio lo delataban con "worker process has failed to exit gracefully").
        this.metricsInterval = setInterval(() => {
            this.metrics.gauge('snow_queue_size', this.peakSize, { concurrency: '5' }).catch(() => { });
            this.metrics.gauge('snow_queue_pending', this.peakPending, { concurrency: '5' }).catch(() => { });
            // No resetear a 0: si el backlog sigue activo al momento del reporte, la
            // próxima ventana debe partir de ahí, no esconder una racha sostenida.
            this.peakSize = this.snowQueue.size;
            this.peakPending = this.snowQueue.pending;
        }, 15_000);
    }

    onModuleDestroy(): void {
        if (this.metricsInterval) clearInterval(this.metricsInterval);
    }

    /** Actualiza el pico de size/pending visto desde el último reporte. */
    private trackQueuePeaks(): void {
        if (this.snowQueue.size > this.peakSize) this.peakSize = this.snowQueue.size;
        if (this.snowQueue.pending > this.peakPending) this.peakPending = this.snowQueue.pending;
    }

    /** true si el backlog en memoria alcanzó el tope — el worker debe frenar la lectura de más filas de la DB. */
    isBacklogFull(): boolean {
        return this.snowQueue.size + this.snowQueue.pending >= SnowRequestQueueService.MAX_BACKLOG;
    }

    // Usado por el worker (modo asíncrono DB-backed) — fire-and-forget
    enqueue(entity: SnowRequestEntity): void {
        const priority = this.getTaskPriority(entity.type, entity.priority);

        this.snowQueue.add(
            () => this.correlationIdService.run(
                () => this.processRequest(entity),
                { correlationId: entity.correlationId, labels: { type: entity.type, source: entity.source } },
            ),
            { priority },
        );
    }

    // Usado por el modo inmediato (sin cola) — saltea la PQueue
    async sendToServiceNow(entity: SnowRequestEntity): Promise<{ sys_id: string; snowNumber: string }> {
        const processor = this.processorFactory.getProcessor(entity.type);
        const snowBulkhead = this.bulkheadRegistry.getForServiceNow();

        try {
            const result = await snowBulkhead.execute(() => processor.process(entity));
            return {
                sys_id: result.result.sys_id,
                snowNumber: result.result.number,
            };
        } catch (error) {
            if (error instanceof CircuitBreakerOpenError) {
                throw new ServiceUnavailableException('ServiceNow no disponible temporalmente — intente de nuevo en unos momentos');
            }
            throw error;
        }
    }

    /**
     * Mayor número = se despacha antes.
     * Base por tipo (400/300/200/100) + offset por nivel (CRITICAL=4 … LOW=1).
     */
    private getTaskPriority(type: RequestType, priority: RequestPriority): number {
        const base = SnowRequestQueueService.TYPE_BASE[type] ?? 100;
        return base + priority;
    }

    private async processRequest(entity: SnowRequestEntity): Promise<void> {
        return this.tracing.run(
            'snowq.processRequest',
            {
                kind: 'producer',
                attributes: { 'snow.type': entity.type, 'snow.priority': String(entity.priority), 'snow.internalNumber': entity.internalNumber },
                correlationId: entity.correlationId,
            },
            () => this._processRequest(entity),
        );
    }

    private async _processRequest(entity: SnowRequestEntity): Promise<void> {
        const snowBulkhead = this.bulkheadRegistry.getForServiceNow();

        try {
            const processor = this.processorFactory.getProcessor(entity.type);
            const result = await snowBulkhead.execute(() => processor.process(entity));

            await this.snowRequestService.markAsDelivered(
                entity.correlationId,
                result.result.sys_id,
                result.result.number,
            );

            this.logger.log(`Procesado → ${entity.internalNumber} | sys_id=${result.result.sys_id} | tipo=${entity.type} | prioridad=${entity.priority}`, 'SnowRequestQueueService');
            this.metrics.counter('snow_requests_delivered_total', { type: entity.type, priority: String(entity.priority) }, entity.correlationId).catch(() => { });
        } catch (error) {
            const message = error?.message ?? String(error);

            if (error instanceof CircuitBreakerOpenError) {
                // Circuit breaker abierto: SN no disponible — openTimeoutMs=30s coincide con
                // el base delay de getRetryDelay para no desperdiciar reintentos.
                await this.snowRequestService.markAsRetry(entity.correlationId, message);
                this.logger.warn(
                    `Circuit breaker ABIERTO para ${entity.internalNumber} [tipo=${entity.type}] — ServiceNow no disponible, reintentando con backoff`,
                    'SnowRequestQueueService',
                );
                this.metrics.counter('snow_requests_retried_total', { type: entity.type, reason: 'circuit_open' }, entity.correlationId).catch(() => { });
            } else if (error instanceof ServiceNowTemporalError) {
                // Error transitorio (5xx, 408, 429): respetar Retry-After si está disponible
                const retryAfterMs = error.retryAfterMs;
                await this.snowRequestService.markAsRetry(entity.correlationId, message, retryAfterMs, error.statusCode);
                this.logger.warn(
                    `Error temporal en ${entity.internalNumber} [tipo=${entity.type}]${retryAfterMs ? ` — Retry-After: ${retryAfterMs}ms` : ''} — reintentando: ${message}`,
                    'SnowRequestQueueService',
                );
                this.metrics.counter('snow_requests_retried_total', { type: entity.type, reason: error.statusCode === 429 ? 'rate_limited' : 'temporal_error' }, entity.correlationId).catch(() => { });
            } else {
                // Error fatal (4xx) o de autenticación (401/403): no tiene sentido reintentar
                await this.snowRequestService.markAsFailed(entity.correlationId, message, error?.statusCode);
                this.logger.error(
                    `Error fatal en ${entity.internalNumber} [tipo=${entity.type}] — marcado como FAILED: ${message}`,
                    error?.stack ?? '',
                    'SnowRequestQueueService',
                );
                this.metrics.counter('snow_requests_failed_total', { type: entity.type }, entity.correlationId).catch(() => { });
            }
        }
    }
}
