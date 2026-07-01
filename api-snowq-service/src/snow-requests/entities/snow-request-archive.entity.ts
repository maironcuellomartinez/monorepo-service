import { RequestType, STATUS } from 'src/common';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index(['correlationId'])
@Index(['status', 'archivedAt'])
@Entity('snow_requests_archive')
export class SnowRequestArchive {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    originalId: number;

    @Column()
    correlationId: string;

    @Column()
    internalNumber: string;

    @Column({ nullable: true })
    description?: string;

    @Column({ nullable: true })
    short_description?: string;

    @Column({ type: 'enum', enum: RequestType })
    type: RequestType;

    @Column({ type: 'int' })
    priority: number;

    @Column({ type: 'json' })
    payload: Record<string, any>;

    @Column({ nullable: true })
    sysId?: string;

    @Column({ nullable: true })
    snowNumber?: string;

    @Column({ type: 'enum', enum: STATUS })
    status: STATUS;

    @Column()
    source: string;

    @Column({ default: false })
    immediate: boolean;

    @Column({ nullable: true, type: 'varchar', length: 512 })
    fingerprint: string | null;

    @Column({ nullable: true, type: 'datetime' })
    expiresAt: Date | null;

    @Column({ default: 0 })
    retryCount: number;

    @Column({ default: 10 })
    maxRetries: number;

    @Column({ nullable: true, type: 'datetime' })
    nextRetryAt: Date | null;

    @Column({ nullable: true, type: 'text' })
    lastError: string | null;

    @Column({ nullable: true, type: 'datetime' })
    resolvedAt: Date | null;

    @Column({ type: 'datetime' })
    createdAt: Date;

    @Column({ type: 'datetime' })
    updatedAt: Date;

    @CreateDateColumn()
    archivedAt: Date;
}
