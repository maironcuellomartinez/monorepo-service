// infrastructure/persistence/typeorm/entities/appointment.entity.ts
import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { IssueTypeEntity } from './issue-type.entity';
import { CornerEntity } from './corner.entity';
import { TechnicianEntity } from './technician.entity';
import { UserEntity } from './user.entity';
import { CompanyEntity } from './company.entity';
import { DeviceEntity } from './device.entity';
import { LockerEntity } from './locker.entity';
import { AppointmentSlotEntity } from './appointment-slot.entity';
import { AppointmentTimelineEntity } from './appointment-timeline.entity';
import { ServiceNowTicketLinkEntity } from './servicenow-ticket-link.entity';

@Entity('appointments')
export class AppointmentEntity {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  appointment_id: string;

  /**
   * Correlativo incremental usado como referencia externa estable (ver
   * ServiceNowIntegrationService.buildExternalId). AUTO_INCREMENT nativo de
   * MySQL — no es la PK (appointment_id sigue siendo el UUID), pero InnoDB
   * permite una columna auto-increment secundaria mientras tenga su propio
   * índice. Antes se coordinaba a mano vía la tabla `issue_sequences`
   * (contador compartido con IncidentEntity/RequestEntity, que ya no
   * existen desde la unificación a Appointment de 2026-07) — sin esa
   * coordinación cross-tabla pendiente, MySQL puede generarlo solo.
   */
  @Index({ unique: true })
  @Column({ type: 'int', unsigned: true, generated: 'increment' })
  issue_id: number;

  /** 'ISSUE' | 'REQUEST' — decide la estrategia de ticket SN, no la clase del agregado. */
  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'varchar', length: 50 })
  issue_type_id: string;

  @Column({ type: 'varchar', length: 50 })
  customer_id: string;

  @Column({ type: 'varchar', length: 50 })
  company_id: string;

  @Column({ type: 'varchar', length: 50 })
  corner_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  device_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  locker_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  current_technician_id: string | null;

  /** Técnico que creó la cita (paridad con requests.technician_id de hoy). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  created_by_technician_id: string | null;

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

  @ManyToOne(() => CompanyEntity)
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @ManyToOne(() => CornerEntity)
  @JoinColumn({ name: 'corner_id' })
  corner: CornerEntity;

  @ManyToOne(() => TechnicianEntity)
  @JoinColumn({ name: 'current_technician_id' })
  currentTechnician: TechnicianEntity;

  @ManyToOne(() => TechnicianEntity)
  @JoinColumn({ name: 'created_by_technician_id' })
  createdByTechnician: TechnicianEntity;

  @ManyToOne(() => DeviceEntity)
  @JoinColumn({ name: 'device_id' })
  device: DeviceEntity;

  @ManyToOne(() => LockerEntity)
  @JoinColumn({ name: 'locker_id' })
  locker: LockerEntity;

  @OneToMany(() => AppointmentSlotEntity, (slot) => slot.appointment)
  appointmentSlots: AppointmentSlotEntity[];

  @OneToMany(() => AppointmentTimelineEntity, (timeline) => timeline.appointment)
  timeline: AppointmentTimelineEntity[];

  @OneToMany(() => ServiceNowTicketLinkEntity, (link) => link.appointment)
  ticketLinks: ServiceNowTicketLinkEntity[];
}
