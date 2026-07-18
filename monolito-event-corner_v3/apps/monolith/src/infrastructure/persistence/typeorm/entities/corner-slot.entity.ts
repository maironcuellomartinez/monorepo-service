// infrastructure/persistence/typeorm/entities/corner-slot.entity.ts
import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { CornerEntity } from './corner.entity';
import { CornerScheduleEntity } from './corner-schedule.entity';
import { IncidentSlotEntity } from './incident-slot.entity';

// F2.8 — índice compuesto para queries de disponibilidad con filtros de hold
// idx_corner_id dedicado para que MySQL use ese como soporte de FK y pueda modificar libremente el compuesto
@Index('idx_corner_slot_corner_id', ['corner_id'])
@Index('idx_corner_starts_status_held', [
  'corner_id',
  'starts_at',
  'status',
  'held_until',
])
// Único: una sola fila física por franja horaria de un corner. Evita que dos
// schedules solapados (o una doble generación) creen slots duplicados para la
// misma ventana — la disponibilidad no sabe desambiguarlos. La generación usa
// INSERT IGNORE (saveMany) para saltarse ventanas ya existentes.
@Index('uq_corner_slot_window', ['corner_id', 'starts_at', 'ends_at'], {
  unique: true,
})
@Entity('corner_slots')
export class CornerSlotEntity {
  @PrimaryColumn({ length: 50 })
  slot_id: string;

  @Column({ length: 50 })
  corner_id: string;

  @Column({ length: 50 })
  schedule_id: string;

  @Column({ type: 'timestamp' })
  starts_at: Date;

  @Column({ type: 'timestamp' })
  ends_at: Date;

  @Column({ length: 20 })
  status: string; // AVAILABLE, HELD, BOOKED, EXPIRED

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  held_by_user_id: string | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  held_until: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @ManyToOne(() => CornerEntity)
  @JoinColumn({ name: 'corner_id' })
  corner: CornerEntity;

  @ManyToOne(() => CornerScheduleEntity)
  @JoinColumn({ name: 'schedule_id' })
  schedule: CornerScheduleEntity;

  @OneToMany(() => IncidentSlotEntity, (incidentSlot) => incidentSlot.slot)
  incidentSlots: IncidentSlotEntity[];
}
