import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BatchDraftEntity } from './batch-draft.entity';

@Entity('incident_batch_draft_items')
export class BatchDraftItemEntity {
    @PrimaryColumn({ length: 50 })
    id: string;

    @Column({ length: 50 })
    local_id: string;

    @Column({ length: 50 })
    corner_id: string;

    @Column({ length: 100 })
    corner_name: string;

    @Column({ length: 50 })
    customer_id: string;

    @Column({ length: 200 })
    customer_name: string;

    @Column({ length: 200 })
    customer_email: string;

    @Column({ length: 100 })
    device_serial: string;

    @Column({ length: 50 })
    issue_type_id: string;

    @Column({ length: 200 })
    issue_type_name: string;

    @Column({ type: 'json' })
    slot_ids: string[];

    @Column({ type: 'timestamp' })
    start_time: Date;

    @Column({ type: 'timestamp' })
    end_time: Date;

    @Column({ type: 'text', nullable: true, default: null })
    description: string | null;

    @Column({ type: 'text', nullable: true, default: null })
    notes: string | null;

    @Column({ length: 20, default: 'pending' })
    status: 'pending' | 'error';

    @Column({ type: 'text', nullable: true, default: null })
    last_error: string | null;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Index('idx_batch_draft_item_draft')
    @ManyToOne(() => BatchDraftEntity, (draft) => draft.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'draft_id' })
    draft: BatchDraftEntity;

    // TypeORM shadow FK — populated automatically, usable in where clauses
    draft_id: string;
}
