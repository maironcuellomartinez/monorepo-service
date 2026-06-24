// infrastructure/persistence/typeorm/entities/incident-timeline.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { IncidentEntity } from './incident.entity';
import { TechnicianEntity } from './technician.entity';

@Entity('incident_timeline')
export class IncidentTimelineEntity {
    @PrimaryGeneratedColumn('uuid')
    activity_id: string;

    @Column({ length: 50 })
    incident_id: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    technician_id: string;

    @Column({ length: 20 })
    action_type: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    from_status: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    to_status: string;

    @Column({ type: 'timestamp', nullable: true })
    worked_from: Date;

    @Column({ type: 'timestamp', nullable: true })
    worked_until: Date;

    @Column({ type: 'varchar', length: 500, nullable: true })
    comment: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @ManyToOne(() => IncidentEntity, incident => incident.timeline)
    @JoinColumn({ name: 'incident_id' })
    incident: IncidentEntity;

    @ManyToOne(() => TechnicianEntity)
    @JoinColumn({ name: 'technician_id' })
    technician: TechnicianEntity;
}