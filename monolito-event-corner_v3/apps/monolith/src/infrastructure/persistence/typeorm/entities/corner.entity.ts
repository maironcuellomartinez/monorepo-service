import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import { CornerScheduleEntity } from './corner-schedule.entity';
import { TechnicianEntity } from './technician.entity';
import { LockerEntity } from './locker.entity';

@Entity('corners')
export class CornerEntity {
    @PrimaryColumn({ length: 50 })
    corner_id: string;

    @Column({ length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    code: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    client_name: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    servicenow_location: string | null;

    @Column({ type: 'varchar', length: 150, nullable: true })
    snow_assignment_group: string | null;

    @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
    latitude: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
    longitude: number | null;

    @Column({ type: 'varchar', length: 60, default: 'UTC' })
    timezone: string;

    @Column({ type: 'varchar', length: 2, default: 'AR' })
    country: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    city: string | null;

    @Column({ default: false })
    only_technicians: boolean;

    @Column({ default: true })
    is_active: boolean;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    // Relacion Un corner a muchos schedule
    @OneToMany(() => CornerScheduleEntity, schedule => schedule.corner)
    schedules: CornerScheduleEntity[];

    // Relacion Un corner a muchos technicians
    @OneToMany(() => TechnicianEntity, tech => tech.corner)
    technicians: TechnicianEntity[];

    // Relacion Un corner a muchos lockers
    @OneToMany(() => LockerEntity, locker => locker.corner)
    lockers: LockerEntity[];
}