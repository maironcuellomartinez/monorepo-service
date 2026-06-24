// infrastructure/persistence/typeorm/entities/schedule-assignment.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CornerScheduleEntity } from './corner-schedule.entity';
import { TechnicianEntity } from './technician.entity';

@Entity('schedule_assignments')
export class ScheduleAssignmentEntity {
    @PrimaryGeneratedColumn('uuid')
    assignment_id: string;

    @Column({ length: 50 })
    schedule_id: string;

    @Column({ length: 50 })
    technician_id: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @ManyToOne(() => CornerScheduleEntity, schedule => schedule.assignments)
    @JoinColumn({ name: 'schedule_id' })
    schedule: CornerScheduleEntity;

    @ManyToOne(() => TechnicianEntity)
    @JoinColumn({ name: 'technician_id' })
    technician: TechnicianEntity;
}