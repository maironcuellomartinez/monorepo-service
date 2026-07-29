import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { TechnicianEntity } from './technician.entity';

@Entity('appointment_timeline')
export class AppointmentTimelineEntity {
    @PrimaryGeneratedColumn('uuid')
    activity_id: string;

    @Column({ length: 50 })
    appointment_id: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    technician_id: string;

    // Ya ancho desde el inicio (40) — no repetir el bug de incident_timeline,
    @Column({ length: 40 })
    action_type: string;

    // 'PENDING_REPLACEMENT_DELIVERY' (28 chars) ya existen en AppointmentStatus.
    @Column({ type: 'varchar', length: 50, nullable: true })
    from_status: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    to_status: string;

    @Column({ type: 'timestamp', nullable: true })
    worked_from: Date;

    @Column({ type: 'timestamp', nullable: true })
    worked_until: Date;

    @Column({ type: 'varchar', length: 500, nullable: true })
    comment: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @ManyToOne(() => AppointmentEntity, appointment => appointment.timeline)
    @JoinColumn({ name: 'appointment_id' })
    appointment: AppointmentEntity;

    @ManyToOne(() => TechnicianEntity)
    @JoinColumn({ name: 'technician_id' })
    technician: TechnicianEntity;
}
