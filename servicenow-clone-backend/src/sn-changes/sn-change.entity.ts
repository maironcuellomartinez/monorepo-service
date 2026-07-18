import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sn_changes')
export class SnChangeEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  sys_id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  number: string;

  @Column({ type: 'varchar', length: 10, default: '-5' })
  state: string;

  @Column({ type: 'varchar', length: 50, default: 'normal' })
  change_type: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'text', nullable: true })
  short_description: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  assignment_group: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  company: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  caller_id: string | null;

  @Column({ type: 'date', nullable: true })
  start_date: string | null;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  close_code: string | null;

  @Column({ type: 'text', nullable: true })
  close_notes: string | null;

  @Column({ type: 'text', nullable: true })
  work_notes: string | null;

  @Column({ type: 'datetime', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
