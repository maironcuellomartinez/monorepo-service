import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Imita cmn_location de ServiceNow — el campo location de los tickets apunta acá */
@Entity('sn_locations')
export class SnLocationEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  sys_id: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
