import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sn_incidents')
export class SnIncidentEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  sys_id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  number: string;

  @Column({ type: 'varchar', length: 10, default: '1' })
  state: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subcategory: string | null;

  @Column({ type: 'varchar', length: 10, default: '3' })
  priority: string;

  @Column({ type: 'varchar', length: 10, default: '2' })
  impact: string;

  @Column({ type: 'varchar', length: 10, default: '2' })
  urgency: string;

  // Campo custom que envía api-snowq-service (mapea el severity del monolito).
  @Column({ type: 'varchar', length: 20, default: 'medium' })
  u_severity: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  assignment_group: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  company: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  caller_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true })
  short_description: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  correlation_id: string | null;

  @Column({ type: 'datetime', nullable: true })
  expected_start: Date | null;

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
