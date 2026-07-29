// infrastructure/persistence/typeorm/entities/servicenow-ticket-link.entity.ts
import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';

@Index('idx_snow_ticket_link_appointment', ['appointment_id'])
@Index('idx_snow_ticket_link_sys_id', ['sys_id'])
@Index('idx_snow_ticket_link_correlation', ['snowq_correlation_id'])
@Index('idx_snow_ticket_link_status', ['status'])
@Entity('servicenow_ticket_links')
export class ServiceNowTicketLinkEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  appointment_id: string;

  /** 'incident' | 'sc_req_item' | 'sc_task' */
  @Column({ type: 'varchar', length: 20 })
  type: string;

  /** 'primary' | 'fulfillment' — cuál es "el" ticket a pollear/cerrar. */
  @Column({ type: 'varchar', length: 20 })
  role: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sys_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  number: string | null;

  /** Solo para type='sc_task': sys_id de la RITM (sc_req_item) padre. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  parent_request_sys_id: string | null;

  /** correlationId de api-snowq-service mientras el ticket está en modo async. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  snowq_correlation_id: string | null;

  /** 'PENDING' | 'ACTIVE' | 'CLOSED' | 'ABANDONED' */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @ManyToOne(() => AppointmentEntity, (appointment) => appointment.ticketLinks)
  @JoinColumn({ name: 'appointment_id' })
  appointment: AppointmentEntity;
}
