import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { IssueTypeEntity } from './issue-type.entity';
import { CornerEntity } from './corner.entity';
import { TechnicianEntity } from './technician.entity';
import { UserEntity } from './user.entity';
import { DeviceEntity } from './device.entity';
import { LockerEntity } from './locker.entity';
import { IncidentSlotEntity } from './incident-slot.entity';
import { IncidentTimelineEntity } from './incident-timeline.entity';

@Entity('incidents')
export class IncidentEntity {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  incident_id: string;

  /**
   * Correlativo incremental usado como referencia externa estable (ver
   * ServiceNowIntegrationService.buildExternalId). Se asigna en
   * TypeOrmIncidentRepository.save() vía la tabla issue_sequences —
   * deliberadamente NO es una columna AUTO_INCREMENT/@Generated: TypeORM
   * synchronize reescribe el índice único de esas columnas en cada
   * comparación de esquema y en MySQL eso choca con la regla "an
   * auto_increment column must be a key" (ER_WRONG_AUTO_KEY en cada
   * restart). Plain column = sin ese churn.
   */
  @Column({ type: 'int', unsigned: true })
  issue_id: number;

  @Column({ type: 'varchar', length: 50 })
  issue_type_id: string;

  @Column({ type: 'varchar', length: 50 })
  customer_id: string;

  @Column({ type: 'varchar', length: 50 })
  corner_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  device_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  locker_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  current_technician_id: string | null;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  @Column({ type: 'int' })
  priority: number;

  /** Canal de origen (ej. 'event-corner-app-batch' = 22 chars) */
  @Column({ type: 'varchar', length: 30 })
  origin_channel: string;

  @Column({ type: 'timestamp' })
  scheduled_start: Date;

  @Column({ type: 'timestamp' })
  scheduled_end: Date;

  @Column({ type: 'int' })
  duration_minutes: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  servicenow_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  servicenow_number: string | null;

  /**
   * correlationId de api-snowq-service cuando el ticket fue procesado en modo async.
   * El api-gateway antepone el prefijo 'snowq:' (SNOWQ_PREFIX en
   * servicenow-outbound.controller.ts) al UUID de 36 chars, por eso el largo
   * debe superar 36.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  snowq_correlation_id: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @Column({ type: 'timestamp', nullable: true })
  closed_at: Date | null;

  /** Fecha estimada de cierre — editable por el técnico, independiente del slot. */
  @Column({ type: 'timestamp', nullable: true })
  estimated_close_at: Date | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @ManyToOne(() => IssueTypeEntity)
  @JoinColumn({ name: 'issue_type_id' })
  issueType: IssueTypeEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'customer_id' })
  customer: UserEntity;

  @ManyToOne(() => CornerEntity)
  @JoinColumn({ name: 'corner_id' })
  corner: CornerEntity;

  @ManyToOne(() => TechnicianEntity)
  @JoinColumn({ name: 'current_technician_id' })
  currentTechnician: TechnicianEntity;

  @ManyToOne(() => DeviceEntity)
  @JoinColumn({ name: 'device_id' })
  device: DeviceEntity;

  @ManyToOne(() => LockerEntity)
  @JoinColumn({ name: 'locker_id' })
  locker: LockerEntity;

  @OneToMany(() => IncidentSlotEntity, (incidentSlot) => incidentSlot.incident)
  incidentSlots: IncidentSlotEntity[];

  @OneToMany(() => IncidentTimelineEntity, (timeline) => timeline.incident)
  timeline: IncidentTimelineEntity[];
}
