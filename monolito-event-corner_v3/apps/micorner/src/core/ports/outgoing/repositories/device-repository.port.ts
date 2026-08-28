// core/ports/outgoing/repositories/device-repository.port.ts
import { Result } from '@app/result';
import { DEVICE_REPOSITORY } from './tokens';
import { Device } from '@app/core/domain/entities/device.entity';
import { DeviceId } from '@app/shared/types/branded-ids';

export interface IDeviceRepository {
    save(device: Device): Promise<Result<void>>;
    findById(id: DeviceId): Promise<Result<Device | null>>;
    findBySerial(serialNumber: string): Promise<Result<Device | null>>;
    /** Devuelve devices cuyo last_sync_at es anterior al umbral dado (excluye virtuales) */
    findStaleEntries(olderThan: Date): Promise<Result<Device[]>>;
    /** Devuelve todos los dispositivos (virtuales y reales) asignados a un usuario */
    findByUser(customerId: string): Promise<Result<Device[]>>;
    /** @deprecated usar findByUser */
    findVirtualByUser(customerId: string): Promise<Result<Device[]>>;
    update(device: Device): Promise<Result<void>>;
    delete(id: DeviceId): Promise<Result<void>>;
}

export { DEVICE_REPOSITORY };
