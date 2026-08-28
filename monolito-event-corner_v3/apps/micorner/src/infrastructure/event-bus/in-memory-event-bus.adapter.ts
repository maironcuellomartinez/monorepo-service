// infrastructure/event-bus/in-memory-event-bus.adapter.ts
import { Injectable } from '@nestjs/common';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { DomainEvent } from '@app/shared/domain-event';
import { Result } from '@app/result';

@Injectable()
export class InMemoryEventBusAdapter implements IEventBus {
    private handlers: Map<string, ((event: DomainEvent) => Promise<void>)[]> = new Map();

    async publish(event: DomainEvent): Promise<Result<void>> {
        const handlers = this.handlers.get(event.type) || [];
        await Promise.all(handlers.map(h => h(event)));
        return Result.ok(undefined);
    }

    async publishMany(events: DomainEvent[]): Promise<Result<void>> {
        await Promise.all(events.map(e => this.publish(e)));
        return Result.ok(undefined);
    }

    subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType)!.push(handler);
    }
}