import { DomainEvent } from '@app/shared/domain-event';
import { Result } from "@app/result";

export { DomainEvent };

export interface IEventBus {
    publish(event: DomainEvent): Promise<Result<void>>;
    publishMany(events: DomainEvent[]): Promise<Result<void>>;
    subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void;
}
