import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('obs_metric_points')
@Index('idx_metric_name_service', ['name', 'service'])
@Index('idx_metric_timestamp', ['timestamp'])
@Index('idx_metric_correlation', ['correlationId'])
export class MetricPointEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Column({ type: 'varchar', length: 100 })
    service: string;

    @Column({ type: 'double' })
    value: number;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit: string | null;

    @Column({ type: 'varchar', length: 30 })
    type: string;

    @Column({ type: 'json', nullable: true })
    labels: Record<string, string> | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    correlationId: string | null;

    @Column({ type: 'datetime', precision: 3 })
    timestamp: Date;

    @CreateDateColumn({ type: 'datetime' })
    receivedAt: Date;
}
