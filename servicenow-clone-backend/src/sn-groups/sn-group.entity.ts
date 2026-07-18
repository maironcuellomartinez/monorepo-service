import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sn_groups')
export class SnGroupEntity {
  /** UUID — se usa como sys_id en ServiceNow (assignment_group en tickets) */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  sys_id: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  name: string;

  /** Tipo ITIL del grupo: 'itil', 'change_management', 'problem_management', etc. */
  @Column({ type: 'varchar', length: 50, default: 'itil' })
  type: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  description: string | null;

  /** Código de ubicación geográfica — ej: ARG-BA-001, ESP-MD-001 */
  @Column({ type: 'varchar', length: 50, nullable: true })
  location: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
