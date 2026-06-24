import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('obs_trace_spans')
@Index('idx_span_trace', ['traceId'])
@Index('idx_span_correlation', ['correlationId'])
@Index('idx_span_service', ['serviceName'])
@Index('idx_span_start', ['startTime'])
export class TraceSpanEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 32 })
    traceId: string;

    @Column({ type: 'varchar', length: 16 })
    spanId: string;

    @Column({ type: 'varchar', length: 16, nullable: true })
    parentSpanId: string | null;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 100 })
    serviceName: string;

    @Column({ type: 'varchar', length: 36, nullable: true })
    correlationId: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    kind: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    statusCode: string | null;

    @Column({ type: 'bigint' })
    startTime: string;

    @Column({ type: 'bigint' })
    endTime: string;

    @Column({ type: 'int', nullable: true })
    durationMs: number | null;

    @Column({ type: 'json', nullable: true })
    attributes: Record<string, any> | null;

    @Column({ type: 'json', nullable: true })
    events: Record<string, any>[] | null;

    @CreateDateColumn({ type: 'datetime' })
    receivedAt: Date;
}
