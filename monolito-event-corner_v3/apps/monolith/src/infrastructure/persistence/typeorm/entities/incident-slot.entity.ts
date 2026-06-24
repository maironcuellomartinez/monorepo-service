// infrastructure/persistence/typeorm/entities/incident-slot.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { IncidentEntity } from './incident.entity';
import { CornerSlotEntity } from './corner-slot.entity';

@Entity('incident_slots')
export class IncidentSlotEntity {
    @PrimaryGeneratedColumn('uuid')
    relation_id: string;

    @Column({ length: 50 })
    incident_id: string;

    @Column({ length: 50 })
    slot_id: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @ManyToOne(() => IncidentEntity, incident => incident.incidentSlots)
    @JoinColumn({ name: 'incident_id' })
    incident: IncidentEntity;

    @ManyToOne(() => CornerSlotEntity, slot => slot.incidentSlots)
    @JoinColumn({ name: 'slot_id' })
    slot: CornerSlotEntity;
}