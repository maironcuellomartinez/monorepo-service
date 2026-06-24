import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CornerEntity } from './corner.entity';

@Entity('lockers')
export class LockerEntity {
    @PrimaryColumn({ length: 50 })
    locker_id: string;

    @Column({ length: 50 })
    corner_id: string;

    @Column({ length: 50, unique: true })
    locker_code: string;

    @Column({ length: 20 })
    status: string; // AVAILABLE, OCCUPIED, OUT_OF_SERVICE

    @Column({ type: 'varchar', length: 255, nullable: true })
    description: string | null;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @ManyToOne(() => CornerEntity, corner => corner.lockers)
    @JoinColumn({ name: 'corner_id' })
    corner: CornerEntity;
}