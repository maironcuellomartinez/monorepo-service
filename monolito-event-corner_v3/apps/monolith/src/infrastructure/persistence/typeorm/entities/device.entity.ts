import { DeviceStatus } from '../../../../core/domain/enums/device-status.enum';
import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('devices')
export class DeviceEntity {
    @PrimaryColumn({ length: 50 })
    device_id: string;

    @Column({ type: 'varchar', length: 100, unique: true })
    serial_number: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    model: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    brand: string | null;

    @Column({ type: 'varchar', length: 50, nullable: true })
    device_type: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    assigned_user_id: string | null;

    @Column({ type: 'varchar', length: 200, nullable: true })
    assigned_user_name: string | null;

    @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.STALE })
    status: DeviceStatus;

    @Column({ type: 'boolean', default: false })
    is_virtual: boolean;

    @Index()
    @Column({ type: 'timestamp', default: () => "'1970-01-01 00:00:00'" })
    last_sync_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;
}
