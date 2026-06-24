// src/domain/entities/integration-event.entity.ts
import { AggregateRoot } from '@nestjs/cqrs';
import { IntegrationStatus } from '../value-objects/integration-status.vo';
import { v4 as uuidv4 } from 'uuid';
import { IntegrationStep } from './integration-step.entity';

export class IntegrationEvent extends AggregateRoot {
    public readonly id: string;
    public readonly correlationId: string;
    public readonly eventType: string;
    public readonly source: string;
    public readonly payload: any;
    public status: IntegrationStatus;
    public readonly steps: IntegrationStep[];
    public readonly createdAt: Date;
    public updatedAt: Date;
    public error?: string;
    public retryCount: number;

    constructor(
        eventType: string,
        source: string,
        payload: any,
        correlationId?: string
    ) {
        super();
        this.id = uuidv4();
        this.correlationId = correlationId || uuidv4();
        this.eventType = eventType;
        this.source = source;
        this.payload = payload;
        this.status = IntegrationStatus.PENDING;
        this.steps = [];
        this.createdAt = new Date();
        this.updatedAt = new Date();
        this.retryCount = 0;
    }

    addStep(step: IntegrationStep): void {
        this.steps.push(step);
        this.updatedAt = new Date();
    }

    markAsProcessing(): void {
        this.status = IntegrationStatus.PROCESSING;
        this.updatedAt = new Date();
    }

    markAsCompleted(): void {
        this.status = IntegrationStatus.COMPLETED;
        this.updatedAt = new Date();
    }

    markAsFailed(error: string): void {
        this.status = IntegrationStatus.FAILED;
        this.error = error;
        this.updatedAt = new Date();
    }

    shouldRetry(): boolean {
        return this.retryCount < 3 &&
            this.status.value !== IntegrationStatus.COMPLETED.value;
    }

    incrementRetry(): void {
        this.retryCount++;
        this.updatedAt = new Date();
    }
}