import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('obs_log_entries')
@Index('idx_log_correlation', ['correlationId'])
@Index('idx_log_service_level', ['service', 'level'])
@Index('idx_log_timestamp', ['timestamp'])
@Index('idx_log_trace', ['traceId'])
export class LogEntryEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 10 })
    level: string;

    @Column({ type: 'text' })
    message: string;

    @Column({ type: 'varchar', length: 36, nullable: true })
    correlationId: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    traceId: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    spanId: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    context: string | null;

    @Column({ type: 'varchar', length: 100 })
    service: string;

    @Column({ type: 'text', nullable: true })
    stack: string | null;

    @Column({ type: 'json', nullable: true })
    meta: Record<string, any> | null;

    @Column({ type: 'datetime', precision: 3 })
    timestamp: Date;

    @CreateDateColumn({ type: 'datetime' })
    receivedAt: Date;
}
