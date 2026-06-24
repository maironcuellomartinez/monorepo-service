// infrastructure/persistence/typeorm/repositories/device.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { IDeviceRepository } from '../../../../core/ports/outgoing/repositories/device-repository.port';
import { DeviceEntity } from '../entities/device.entity';
import { DeviceId } from '@app/shared/types/branded-ids';
import { SerialNumber } from '../../../../core/domain/value-objects/serial-number.value';
import { Result } from '@app/result';
import { Device } from '@app/core/domain/entities/device.entity';

@Injectable()
export class TypeOrmDeviceRepository implements IDeviceRepository {
    constructor(
        @InjectRepository(DeviceEntity)
        private readonly repo: Repository<DeviceEntity>,
    ) { }

    /**
     * Guarda un dispositivo en la base de datos.
     * @example
     * ```typescript
     * const device = Device.create({
     *     id: DeviceId.create('device-1'),
     *     serialNumber: SerialNumber.create('serial-number-1'),
     *     model: 'Model 1',
     *     brand: 'Brand 1',
     *     deviceType: 'Device Type 1',
     *     assignedUserId: 'assigned-user-id-1',
     *     assignedUserName: 'Assigned User Name 1',
     *     status: 'Status 1',
     *     lastSyncAt: new Date(),
     *     createdAt: new Date(),
     * });
     * const result = await this.deviceRepository.save(device);
     * ```
     * @param device El dispositivo a guardar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async save(device: Device): Promise<Result<void>> {
        try {
            await this.repo.save(this.toEntity(device));
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Busca un dispositivo por su ID.
     * @example
     * ```typescript
     * const device = await this.deviceRepository.findById('device-1');
     * ```
     * @param id El ID del dispositivo a buscar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async findById(id: DeviceId): Promise<Result<Device | null>> {
        try {
            const entity = await this.repo.findOne({ where: { device_id: id.toString() } });
            return Result.ok(entity ? this.toDomain(entity) : null);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Busca un dispositivo por su número de serie.
     * @example
     * ```typescript
     * const device = await this.deviceRepository.findBySerial('serial-number-1');
     * ```
     * @param serialNumber El número de serie del dispositivo a buscar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async findBySerial(serialNumber: string): Promise<Result<Device | null>> {
        try {
            const entity = await this.repo.findOne({ where: { serial_number: serialNumber } });
            return Result.ok(entity ? this.toDomain(entity) : null);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Busca dispositivos con entradas antiguas.
     * @example
     * ```typescript
     * const devices = await this.deviceRepository.findStaleEntries(new Date());
     * ```
     * @param olderThan La fecha límite para buscar dispositivos con entradas antiguas.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async findStaleEntries(olderThan: Date): Promise<Result<Device[]>> {
        try {
            const entities = await this.repo.find({
                where: {
                    last_sync_at: LessThan(olderThan),
                    is_virtual: false,
                },
                order: { last_sync_at: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByUser(customerId: string): Promise<Result<Device[]>> {
        try {
            const entities = await this.repo.find({
                where: { assigned_user_id: customerId },
                order: { created_at: 'DESC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findVirtualByUser(customerId: string): Promise<Result<Device[]>> {
        return this.findByUser(customerId);
    }

    /**
     * Actualiza un dispositivo en la base de datos.
     * @example
     * ```typescript
     * const device = Device.create({
     *     id: DeviceId.create('device-1'),
     *     serialNumber: SerialNumber.create('serial-number-1'),
     *     model: 'Model 1',
     *     brand: 'Brand 1',
     *     deviceType: 'Device Type 1',
     *     assignedUserId: 'assigned-user-id-1',
     *     assignedUserName: 'Assigned User Name 1',
     *     status: 'Status 1',
     *     lastSyncAt: new Date(),
     *     createdAt: new Date(),
     * });
     * const result = await this.deviceRepository.update(device);
     * ```
     * @param device El dispositivo a actualizar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async update(device: Device): Promise<Result<void>> {
        try {
            const e = this.toEntity(device);
            await this.repo.update(
                { device_id: e.device_id },
                {
                    serial_number: e.serial_number,
                    model: e.model,
                    brand: e.brand,
                    device_type: e.device_type,
                    assigned_user_id: e.assigned_user_id,
                    assigned_user_name: e.assigned_user_name,
                    status: e.status,
                    last_sync_at: e.last_sync_at,
                },
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Elimina un dispositivo de la base de datos.
     * @example
     * ```typescript
     * const result = await this.deviceRepository.delete('device-1');
     * ```
     * @param id El ID del dispositivo a eliminar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async delete(id: DeviceId): Promise<Result<void>> {
        try {
            await this.repo.delete({ device_id: id.toString() });
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    // ── Mappers ───────────────────────────────────────────────────────────────
    /**
     * Convierte un dispositivo de dominio a entidad.
     * @param domain El dispositivo de dominio.
     * @returns La entidad del dispositivo.
     */
    private toEntity(domain: Device): DeviceEntity {
        const entity = new DeviceEntity();
        entity.device_id = domain.id.toString();
        entity.serial_number = domain.serialNumber.value;
        entity.model = domain.model;
        entity.brand = domain.brand;
        entity.device_type = domain.deviceType;
        entity.assigned_user_id = domain.assignedUserId;
        entity.assigned_user_name = domain.assignedUserName;
        entity.status = domain.status;
        entity.is_virtual = domain.isVirtual;
        entity.last_sync_at = domain.lastSyncAt;
        entity.created_at = domain.createdAt;
        return entity;
    }

    /**
     * Convierte una entidad de dispositivo a dispositivo de dominio.
     * @param entity La entidad del dispositivo.
     * @returns El dispositivo de dominio.
     */
    private toDomain(entity: DeviceEntity): Device {
        // Seriales virtuales son generados internamente — usar reconstitute para evitar validación
        const serialNumber = entity.is_virtual
            ? SerialNumber.reconstitute(entity.serial_number)
            : (() => {
                const r = SerialNumber.create(entity.serial_number);
                if (r.isFailure) throw new Error(`Invalid serial number in DB: ${r.unwrapError().message}`);
                return r.unwrap();
            })();

        return Device.reconstitute(
            entity.device_id as DeviceId,
            serialNumber,
            entity.model,
            entity.brand,
            entity.device_type,
            entity.assigned_user_id,
            entity.assigned_user_name,
            entity.status,
            entity.is_virtual,
            entity.last_sync_at,
            entity.created_at,
        );
    }
}
