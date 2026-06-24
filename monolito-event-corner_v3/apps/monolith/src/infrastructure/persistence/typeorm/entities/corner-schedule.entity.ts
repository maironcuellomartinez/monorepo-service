import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CornerEntity } from './corner.entity';
import { ScheduleAssignmentEntity } from './schedule-assignment.entity';
import { CornerSlotEntity } from './corner-slot.entity';
import { DayOfWeek } from '@app/core/domain/enums/day-of-week.enum';

@Entity('corner_schedules')
export class CornerScheduleEntity {
    @PrimaryColumn({ length: 50 })
    schedule_id: string;

    @Column({ length: 50 })
    corner_id: string;

    @Column({ length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 3, nullable: true })
    day_of_week: DayOfWeek | null; // null = todos los días del rango de fechas

    @Column({ type: 'time' })
    start_time: string;

    @Column({ type: 'time' })
    end_time: string;

    @Column({ type: 'date' })
    valid_from: Date;

    @Column({ type: 'date' })
    valid_until: Date;

    @Column({ type: 'int' })
    slot_duration_minutes: number;

    @Column({ default: true })
    is_active: boolean;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @ManyToOne(() => CornerEntity, corner => corner.schedules)
    @JoinColumn({ name: 'corner_id' })
    corner: CornerEntity;

    @OneToMany(() => ScheduleAssignmentEntity, assignment => assignment.schedule)
    assignments: ScheduleAssignmentEntity[];

    @OneToMany(() => CornerSlotEntity, slot => slot.schedule)
    slots: CornerSlotEntity[];
}