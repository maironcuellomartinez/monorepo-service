// infrastructure/event-bus/outbox-worker.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThanOrEqual } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ExponentialBackoff } from '@backendkit-labs/retry';
import { DomainEvent } from '@app/shared/domain-event';
import { CorrelationIdService, TracingService } from '@app/observability';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import { OutboxEventEntity } from '../persistence/typeorm/entities/outbox-event.entity';
import { InMemoryEventBusAdapter } from './in-memory-event-bus.adapter';

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 5_000;
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 300_000; // 5 min cap

/**
 * Worker que procesa los eventos pendientes del outbox.
 *
 * Cada POLL_INTERVAL_MS lee hasta BATCH_SIZE eventos elegibles (no publicados,
 * no fallidos definitivamente, y con retry_after vencido o nulo).
 * Si el handler lanza, aplica backoff exponencial y decrementa reintentos.
 * Cuando se agotan los reintentos el evento se marca como failed_at (DLQ lógica).
 */
@Injectable()
export class OutboxWorkerService {
    private readonly logger = new Logger(OutboxWorkerService.name);

    /**
     * Backoff exponencial para el retry_after (durable, en DB).
     * nextDelay(n) = BASE * 2^(n-1), tope MAX. Llamado con (retryCount + 1)
     * para preservar la fórmula previa: BASE * 2^retryCount.
     */
    private readonly backoff = new ExponentialBackoff({
        baseDelay: BASE_RETRY_DELAY_MS,
        multiplier: 2,
        maxDelay: MAX_RETRY_DELAY_MS,
    });

    constructor(
        @InjectRepository(OutboxEventEntity)
        private readonly outboxRepo: Repository<OutboxEventEntity>,
        @Inject(IN_MEMORY_EVENT_BUS)
        private readonly inMemoryBus: InMemoryEventBusAdapter,
        private readonly correlation: CorrelationIdService,
        private readonly tracing: TracingService,
    ) { }

    @Interval(POLL_INTERVAL_MS)
    async processOutbox(): Promise<void> {
        return this.tracing.run(
            'micorner.job.outboxWorker',
            { kind: 'internal' },
            () => this._processOutbox(),
        );
    }

    private async _processOutbox(): Promise<void> {
        const now = new Date();

        // Fetch events that are: unpublished, not permanently failed,
        // and either never retried or past their backoff window.
        const pending = await this.outboxRepo.find({
            where: [
                { published_at: IsNull(), failed_at: IsNull(), retry_after: IsNull() },
                { published_at: IsNull(), failed_at: IsNull(), retry_after: LessThanOrEqual(now) },
            ],
            order: { created_at: 'ASC' },
            take: BATCH_SIZE,
        });

        if (pending.length === 0) return;

        this.logger.debug(`Dispatching ${pending.length} outbox event(s)`);

        for (const outboxEvent of pending) {
            try {
                const domainEvent = outboxEvent.payload as DomainEvent;
                await this.correlation.run(
                    () => this.inMemoryBus.publish(domainEvent),
                    {
                        correlationId: domainEvent.correlationId ?? outboxEvent.event_id,
                        labels: { job: 'outbox-worker', eventType: outboxEvent.event_type, aggregateId: outboxEvent.aggregate_id },
                    },
                );
                await this.outboxRepo.update(
                    { event_id: outboxEvent.event_id },
                    { published_at: new Date() },
                );
            } catch (error) {
                const retryCount = outboxEvent.retry_count + 1;
                const isExhausted = retryCount >= outboxEvent.max_retries;
                const delayMs = this.backoff.nextDelay(retryCount + 1);

                this.logger.error(
                    `Outbox event ${outboxEvent.event_id} (${outboxEvent.event_type}) ` +
                    `failed — attempt ${retryCount}/${outboxEvent.max_retries}: ${error}`,
                );

                await this.outboxRepo.update(
                    { event_id: outboxEvent.event_id },
                    {
                        retry_count: retryCount,
                        last_error: String(error).slice(0, 1000),
                        retry_after: isExhausted ? null : new Date(Date.now() + delayMs),
                        failed_at: isExhausted ? new Date() : null,
                    },
                );

                if (isExhausted) {
                    this.logger.warn(
                        `Outbox event ${outboxEvent.event_id} exhausted ${outboxEvent.max_retries} retries — marked as failed`,
                    );
                }
            }
        }
    }
}
