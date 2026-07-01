// infrastructure/event-bus/outbox-event-bus.adapter.ts
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TracingService } from '@app/observability';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { DomainEvent } from '@app/shared/domain-event';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import { Result } from '@app/result';
import { OutboxEventEntity } from '../persistence/typeorm/entities/outbox-event.entity';
import { InMemoryEventBusAdapter } from './in-memory-event-bus.adapter';

/**
 * Implementación del IEventBus con patrón Outbox.
 *
 * publish/publishMany → persiste los eventos en `outbox_events` (DB).
 * subscribe          → delega al bus in-memory donde los handlers están registrados.
 *
 * El OutboxWorkerService lee los eventos pendientes cada 5 s y los despacha
 * al InMemoryEventBusAdapter para activar los handlers registrados.
 */
@Injectable()
export class OutboxEventBusAdapter implements IEventBus {
    constructor(
        @InjectRepository(OutboxEventEntity)
        private readonly outboxRepo: Repository<OutboxEventEntity>,
        @Inject(IN_MEMORY_EVENT_BUS)
        private readonly inMemoryBus: InMemoryEventBusAdapter,
        private readonly tracing: TracingService,
    ) { }

    async publish(event: DomainEvent): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.outbox.publish',
            { kind: 'internal', attributes: { 'event.type': event.type, 'event.aggregateId': event.aggregateId } },
            () => this._publish(event),
        );
    }

    private async _publish(event: DomainEvent): Promise<Result<void>> {
        try {
            const entity = this.toEntity(event);
            await this.outboxRepo.save(entity);
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async publishMany(events: DomainEvent[]): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.outbox.publishMany',
            { kind: 'internal', attributes: { 'event.count': events.length } },
            () => this._publishMany(events),
        );
    }

    private async _publishMany(events: DomainEvent[]): Promise<Result<void>> {
        if (events.length === 0) return Result.ok(undefined);
        try {
            const entities = events.map(e => this.toEntity(e));
            await this.outboxRepo.save(entities);
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
        this.inMemoryBus.subscribe(eventType, handler);
    }

    private toEntity(event: DomainEvent): OutboxEventEntity {
        const entity = new OutboxEventEntity();
        // Usa el eventId del agregado si existe (clase abstracta DomainEvent de @app/shared)
        // para garantizar idempotencia. Si no, genera uno nuevo.
        entity.event_id = event.eventId;
        entity.event_type = event.type;
        entity.aggregate_id = event.aggregateId;
        entity.payload = event as unknown as object;
        entity.published_at = null;
        return entity;
    }
}
