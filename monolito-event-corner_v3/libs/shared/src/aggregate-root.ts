import { DomainEvent } from './domain-event';

export abstract class AggregateRoot<T> {
    private _domainEvents: DomainEvent[] = [];

    constructor(
        public readonly id: T,
        private _version: number = 1,
        private _createdAt: Date = new Date(),
        private _updatedAt: Date = new Date()
    ) { }

    // Getters
    get version(): number {
        return this._version;
    }

    get createdAt(): Date {
        return this._createdAt;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    get events(): DomainEvent[] {
        return [...this._domainEvents];
    }

    // Domain events methods
    protected addEvent(event: DomainEvent): void {
        this._domainEvents.push(event);
    }

    public clearEvents(): void {
        this._domainEvents = [];
    }

    // Version control
    protected incrementVersion(): void {
        this._version++;
    }

    // Timestamp update
    protected touch(): void {
        this._updatedAt = new Date();
        this.incrementVersion();
    }

    // Load from history (for event sourcing)
    protected loadFromHistory(events: DomainEvent[]): void {
        for (const event of events) {
            this.applyEvent(event);
            this._version = event.version;
        }
    }

    protected abstract applyEvent(event: DomainEvent): void;
}