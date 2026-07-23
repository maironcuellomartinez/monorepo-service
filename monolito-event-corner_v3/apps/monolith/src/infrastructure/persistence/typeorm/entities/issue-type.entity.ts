// infrastructure/persistence/typeorm/entities/issue-type.entity.ts
import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { IssueTypeTreeEntity } from './issue-type-tree.entity';

@Entity('issue_types')
export class IssueTypeEntity {
  @PrimaryColumn({ length: 50 })
  issue_type_id: string;

  @Column({ length: 50 })
  tree_id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 30 })
  category: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  device_type: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  servicenow_category: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  servicenow_close_category: string | null;

  @Column({ type: 'int', default: 2 })
  sn_urgency: number;

  @Column({ type: 'int', default: 2 })
  sn_impact: number;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  sn_severity: string;

  @Column({ type: 'int' })
  work_minutes: number;

  @Column({ type: 'int', default: 0 })
  spare_minutes: number;

  @Column({ type: 'int', default: 0 })
  close_minutes: number;

  @Column({ default: false })
  not_user_visible: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string;

  @Column({ default: false })
  nps_disabled: boolean;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @ManyToOne(() => IssueTypeTreeEntity, (tree) => tree.issueTypes, {
    nullable: false,
  })
  @JoinColumn({ name: 'tree_id' })
  issueTypeTree: IssueTypeTreeEntity;
}
