// src/domain/entities/external-system.entity.ts
import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';


@Entity('external_systems')
export class ExternalSystem {
    @PrimaryColumn({ type: 'varchar', length: 50 })
    id: string;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 50 })
    type: string;

    @Column({ type: 'json' })
    config: {
        baseUrl: string;
        timeout: number;
        retryPolicy: {
            maxRetries: number;
            initialDelay: number;
            maxDelay: number;
            multiplier: number;
        };
    };

    @Column({ type: 'varchar', length: 50, default: 'CLOSED' })
    circuitState: string;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({ type: 'int', default: 0 })
    failureCount: number;

    @Column({ type: 'datetime', nullable: true })
    lastFailureAt?: Date;

    @Column({ type: 'datetime', nullable: true })
    lastSuccessAt?: Date;

    @Column({ type: 'datetime', nullable: true })
    circuitOpenedAt?: Date;

    @CreateDateColumn({ type: 'datetime' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'datetime' })
    updatedAt: Date;

    // Métodos de dominio
    recordSuccess(): void {
        this.failureCount = 0;
        this.lastSuccessAt = new Date();

        if (this.circuitState === 'HALF_OPEN') {
            this.circuitState = 'CLOSED';
        }
    }

    recordFailure(): void {
        this.failureCount++;
        this.lastFailureAt = new Date();
    }

    canExecute(): boolean {
        return this.isActive && this.circuitState !== 'OPEN';
    }

    getRetryDelay(attempt: number): number {
        const { initialDelay, maxDelay, multiplier } = this.config.retryPolicy;
        const delay = initialDelay * Math.pow(multiplier, attempt - 1);
        return Math.min(delay, maxDelay);
    }
}