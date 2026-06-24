// src/domain/entities/integration-event.entity.ts
import { IntegrationStep } from '../../domain/entities/integration-step.entity';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('integration_events')
export class IntegrationEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    correlationId: string;

    @Column({ type: 'varchar', length: 100 })
    eventType: string;

    @Column({ type: 'varchar', length: 100 })
    source: string;

    @Column({ type: 'json' })
    payload: Record<string, any>;

    @Column({ type: 'varchar', length: 50, default: 'PENDING' })
    status: string;

    @Column({ type: 'json', nullable: true })
    steps: IntegrationStep[];

    @Column({ type: 'text', nullable: true })
    error?: string;

    @Column({ type: 'int', default: 0 })
    retryCount: number;

    @CreateDateColumn({ type: 'datetime' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'datetime' })
    updatedAt: Date;

    // Métodos de dominio
    markAsProcessing(): void {
        this.status = 'PROCESSING';
    }

    markAsCompleted(): void {
        this.status = 'COMPLETED';
    }

    markAsFailed(error: string): void {
        this.status = 'FAILED';
        this.error = error;
    }

    shouldRetry(maxRetries = 3): boolean {
        return this.retryCount < maxRetries && this.status !== 'COMPLETED';
    }

    incrementRetry(): void {
        this.retryCount++;
    }
}