// infrastructure/persistence/typeorm/entities/batch-draft.entity.ts
import { Entity, Column, PrimaryColumn, OneToMany, Index } from 'typeorm';
import { BatchDraftItemEntity } from './batch-draft-item.entity';

@Entity('incident_batch_drafts')
export class BatchDraftEntity {
    @PrimaryColumn({ length: 50 })
    id: string;

    @Index('idx_batch_draft_user')
    @Column({ length: 50 })
    user_id: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @OneToMany(() => BatchDraftItemEntity, (item) => item.draft, { cascade: true, eager: true })
    items: BatchDraftItemEntity[];
}
