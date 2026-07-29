// infrastructure/persistence/typeorm/entities/appointment-slot.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { CornerSlotEntity } from './corner-slot.entity';

@Entity('appointment_slots')
export class AppointmentSlotEntity {
    @PrimaryGeneratedColumn('uuid')
    relation_id: string;

    @Column({ length: 50 })
    appointment_id: string;

    @Column({ length: 50 })
    slot_id: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @ManyToOne(() => AppointmentEntity, appointment => appointment.appointmentSlots)
    @JoinColumn({ name: 'appointment_id' })
    appointment: AppointmentEntity;

    @ManyToOne(() => CornerSlotEntity, slot => slot.appointmentSlots)
    @JoinColumn({ name: 'slot_id' })
    slot: CornerSlotEntity;
}
