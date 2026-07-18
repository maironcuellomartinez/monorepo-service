import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sn_companies')
export class SnCompanyEntity {
  /** UUID — se usa como sys_id en ServiceNow */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  sys_id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  short_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
