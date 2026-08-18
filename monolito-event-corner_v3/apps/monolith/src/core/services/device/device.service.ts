import { Injectable, Logger } from '@nestjs/common';
import { IDeviceService } from '../../ports/incoming/device/device-service.port';
import { IDeviceRepository } from '../../ports/outgoing/repositories/device-repository.port';
import { IAppointmentRepository } from '../../ports/outgoing/repositories/appointment-repository.port';
import {
    IExternalInventoryService,
    InventoryDeviceData,
} from '../../ports/outgoing/external/inventory-service.port';
import { Result } from '@app/result';
import { Device } from '../../domain/entities/device.entity';
import { DeviceId } from '@app/shared/types/branded-ids';
import { SerialNumber } from '../../domain/value-objects/serial-number.value';
import { TracingService } from '@app/observability';

@Injectable()
export class DeviceService implements IDeviceService {
    private readonly logger = new Logger(DeviceService.name);

    constructor(
        private readonly deviceRepo: IDeviceRepository,
        private readonly inventoryService: IExternalInventoryService,
        private readonly appointmentRepo: IAppointmentRepository,
        private readonly tracing: TracingService,
    ) { }

    /**
     * Flowchart:
     *   ¿En DB? No  → API externa → guardar → devolver
     *   ¿En DB? Sí, stale (≥15 min) → API externa → actualizar → devolver
     *   ¿En DB? Sí, fresco (<15 min) → devolver directo
     */
    async resolveDevice(serialNumber: string): Promise<Result<Device | null>> {
        // B: ¿En caché (DB)?
        const found = await this.deviceRepo.findBySerial(serialNumber);
        if (found.isFailure) return found;

        const device = found.unwrap();

        if (device) {
            // C: ¿Menos de 15 min? → D: devolver desde DB
            if (!device.isStale) return Result.ok(device);

            // C: ≥15 min → E: consultar API → F: actualizar → G
            return this._syncAndPersist(device);
        }

        // B: No está en DB → E: consultar API
        const serialResult = SerialNumber.create(serialNumber);
        if (serialResult.isFailure) return Result.err(serialResult.unwrapError());

        let data: InventoryDeviceData | null;
        try {
            data = await this.inventoryService.getBySerial(serialNumber);
        } catch (err: any) {
            return Result.err(new Error(`Inventory API error: ${err?.message ?? err}`));
        }

        // API tampoco lo conoce → null
        if (!data) return Result.ok(null);

        // F: guardar en DB → G: devolver
        const id = crypto.randomUUID() as unknown as DeviceId;
        const newDevice = Device.create(id, serialResult.unwrap()).unwrap();
        newDevice.syncFromSource(
            data.model,
            data.brand,
            data.deviceType,
            data.assignedUser?.userId ?? null,
            data.assignedUser?.nombre ?? null,
        );

        const saveResult = await this.deviceRepo.save(newDevice);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        return Result.ok(newDevice);
    }

    async syncDevice(serialNumber: string): Promise<Result<Device>> {
        const found = await this.deviceRepo.findBySerial(serialNumber);
        if (found.isFailure) return Result.err(found.unwrapError());

        const device = found.unwrap();
        if (!device) return Result.err(new Error(`Device not found: ${serialNumber}`));

        return this._syncAndPersist(device);
    }

    async refreshStaleDevices(): Promise<Result<{ refreshed: number; errors: number }>> {
        const threshold = new Date(Date.now() - 15 * 60_000);
        const staleResult = await this.deviceRepo.findStaleEntries(threshold);
        if (staleResult.isFailure) return Result.err(staleResult.unwrapError());

        let refreshed = 0;
        let errors = 0;

        for (const device of staleResult.unwrap()) {
            const r = await this._syncAndPersist(device);
            if (r.isSuccess) {
                refreshed++;
            } else {
                errors++;
                this.logger.warn(
                    `Failed to sync device ${device.serialNumber.value}: ${r.unwrapError().message}`,
                );
            }
        }

        return Result.ok({ refreshed, errors });
    }

    async createVirtualDevice(customerId: string, deviceType: string, model?: string, serialNumber?: string): Promise<Result<Device>> {
        return this.tracing.run(
            'monolith.createVirtualDevice',
            { kind: 'server', attributes: { 'device.customerId': customerId, 'device.deviceType': deviceType } },
            () => this._createVirtualDevice(customerId, deviceType, model, serialNumber),
        );
    }

    private async _createVirtualDevice(customerId: string, deviceType: string, model?: string, serialNumber?: string): Promise<Result<Device>> {
        const id = crypto.randomUUID() as unknown as DeviceId;
        const serial = serialNumber
            ? SerialNumber.reconstitute(serialNumber.trim().toUpperCase())
            : undefined;
        const device = Device.createVirtual(id, customerId, deviceType, model ?? null, serial);
        const saveResult = await this.deviceRepo.save(device);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());
        return Result.ok(device);
    }

    async updateVirtualDevice(
        deviceId: DeviceId,
        data: { serialNumber?: string; deviceType?: string; model?: string | null; brand?: string | null },
    ): Promise<Result<Device>> {
        return this.tracing.run(
            'monolith.updateVirtualDevice',
            { kind: 'server', attributes: { 'device.deviceId': `${deviceId}` } },
            () => this._updateVirtualDevice(deviceId, data),
        );
    }

    private async _updateVirtualDevice(
        deviceId: DeviceId,
        data: { serialNumber?: string; deviceType?: string; model?: string | null; brand?: string | null },
    ): Promise<Result<Device>> {
        const found = await this.deviceRepo.findById(deviceId);
        if (found.isFailure) return Result.err(found.unwrapError());
        const device = found.unwrap();
        if (!device) return Result.err(new Error(`Device not found: ${deviceId}`));
        if (!device.isVirtual) return Result.err(new Error('Only virtual devices can be updated this way'));

        const serial = data.serialNumber
            ? SerialNumber.reconstitute(data.serialNumber.trim().toUpperCase())
            : undefined;

        const updateResult = device.updateVirtualDetails({
            serialNumber: serial,
            deviceType: data.deviceType,
            model: data.model,
            brand: data.brand,
        });
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        const saveResult = await this.deviceRepo.update(device);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());
        return Result.ok(device);
    }

    async disableDevice(deviceId: DeviceId): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.disableDevice',
            { kind: 'server', attributes: { 'device.deviceId': `${deviceId}` } },
            () => this._disableDevice(deviceId),
        );
    }

    private async _disableDevice(deviceId: DeviceId): Promise<Result<void>> {
        const found = await this.deviceRepo.findById(deviceId);
        if (found.isFailure) return Result.err(found.unwrapError());
        const device = found.unwrap();
        if (!device) return Result.err(new Error(`Device not found: ${deviceId}`));
        device.disable();
        return this.deviceRepo.update(device);
    }

    async enableDevice(deviceId: DeviceId): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.enableDevice',
            { kind: 'server', attributes: { 'device.deviceId': `${deviceId}` } },
            () => this._enableDevice(deviceId),
        );
    }

    private async _enableDevice(deviceId: DeviceId): Promise<Result<void>> {
        const found = await this.deviceRepo.findById(deviceId);
        if (found.isFailure) return Result.err(found.unwrapError());
        const device = found.unwrap();
        if (!device) return Result.err(new Error(`Device not found: ${deviceId}`));
        const result = device.enable();
        if (result.isFailure) return Result.err(result.unwrapError());
        return this.deviceRepo.update(device);
    }

    async completeVirtualDevice(deviceId: DeviceId): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.completeVirtualDevice',
            { kind: 'server', attributes: { 'device.deviceId': `${deviceId}` } },
            () => this._completeVirtualDevice(deviceId),
        );
    }

    private async _completeVirtualDevice(deviceId: DeviceId): Promise<Result<void>> {
        const found = await this.deviceRepo.findById(deviceId);
        if (found.isFailure) return Result.err(found.unwrapError());

        const device = found.unwrap();
        if (!device) return Result.err(new Error(`Virtual device not found: ${deviceId}`));
        if (!device.isVirtual) return Result.err(new Error('Device is not virtual'));

        const unlinkResult = device.unlink();
        if (unlinkResult.isFailure) return Result.err(unlinkResult.unwrapError());

        return this.deviceRepo.delete(deviceId);
    }

    async getDevicesByUser(customerId: string): Promise<Result<Device[]>> {
        const dbResult = await this.deviceRepo.findByUser(customerId);
        if (dbResult.isFailure) return dbResult;

        if (dbResult.unwrap().length > 0) return dbResult;

        // Sin dispositivos en DB → sincronizar desde Minerva y reintentar
        const syncResult = await this.syncUserDevices(customerId);
        if (syncResult.isFailure) {
            this.logger.warn(`Could not sync devices for user ${customerId}: ${syncResult.unwrapError().message}`);
            return Result.ok([]);
        }

        return this.deviceRepo.findByUser(customerId);
    }

    async getVirtualDevicesByUser(customerId: string): Promise<Result<Device[]>> {
        return this.deviceRepo.findByUser(customerId);
    }

    /**
     * Resuelve el serial contra Minerva/DB y vincula el dispositivo al cliente.
     * Si el serial no está en Minerva, crea un registro mínimo (status STALE)
     * con el serial provisto para que aparezca en futuros listados.
     */
    async resolveAndLinkDevice(serialNumber: string, customerId: string): Promise<Result<Device>> {
        return this.tracing.run(
            'monolith.resolveAndLinkDevice',
            { kind: 'server', attributes: { 'device.serialNumber': serialNumber, 'device.customerId': customerId } },
            () => this._resolveAndLinkDevice(serialNumber, customerId),
        );
    }

    private async _resolveAndLinkDevice(serialNumber: string, customerId: string): Promise<Result<Device>> {
        // 1. Intentar resolver desde DB / Minerva
        const resolved = await this.resolveDevice(serialNumber);

        let device: Device | null = resolved.isSuccess ? resolved.unwrap() : null;

        if (!device) {
            // Serial desconocido en Minerva — crear registro mínimo para trazabilidad.
            // Usamos reconstitute para aceptar cualquier formato de serial (incluye guiones, etc.)
            // sin imponer la validación estricta reservada para nuevos seriales de Minerva.
            const serial = SerialNumber.reconstitute(serialNumber.trim().toUpperCase());
            const id = crypto.randomUUID() as unknown as DeviceId;
            const createResult = Device.create(id, serial);
            if (createResult.isFailure) return Result.err(createResult.unwrapError());

            device = createResult.unwrap();
            const saveResult = await this.deviceRepo.save(device);
            if (saveResult.isFailure) return Result.err(saveResult.unwrapError());
        }

        // 2. Vincular al cliente del monolito
        device.assignToUser(customerId);
        const updateResult = await this.deviceRepo.update(device);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(device);
    }

    /**
     * Job principal de sincronización:
     * 1. Obtiene todos los usuarios del monolith
     * 2. Para cada usuario, consulta Minerva por sus dispositivos
     * 3. Upsert en la tabla local + vinculación al usuario
     */
    async syncUserDevices(userId: string): Promise<Result<{ synced: number; errors: number }>> {
        let inventoryDevices: InventoryDeviceData[];
        try {
            inventoryDevices = await this.inventoryService.getDevicesByUser(userId);
        } catch (err: any) {
            return Result.err(new Error(`Inventory API error for user ${userId}: ${err?.message}`));
        }

        let synced = 0;
        let errors = 0;
        for (const data of inventoryDevices) {
            try {
                await this._upsertAndLink(data, userId);
                synced++;
            } catch (err: any) {
                this.logger.warn(`Failed to upsert device ${data.serialNumber} for user ${userId}: ${err?.message}`);
                errors++;
            }
        }
        return Result.ok({ synced, errors });
    }

    /**
     * Job principal de sincronización:
     * Solo sincroniza dispositivos de usuarios con incidencias activas —
     * evita llamadas innecesarias a Minerva para usuarios inactivos.
     * El fallback on-demand (resolveDevice) cubre el resto cuando sea necesario.
     */
    async syncAllUsersDevices(): Promise<Result<{ usersProcessed: number; synced: number; errors: number }>> {
        const idsResult = await this.appointmentRepo.findActiveCustomerIds();
        if (idsResult.isFailure) return Result.err(idsResult.unwrapError());

        const customers = idsResult.unwrap();
        let synced = 0;
        let errors = 0;

        for (const { customerId } of customers) {
            let inventoryDevices: InventoryDeviceData[];
            try {
                inventoryDevices = await this.inventoryService.getDevicesByUser(customerId);
            } catch (err: any) {
                this.logger.warn(`Could not fetch devices for user ${customerId}: ${err?.message}`);
                errors++;
                continue;
            }

            for (const data of inventoryDevices) {
                try {
                    await this._upsertAndLink(data, customerId);
                    synced++;
                } catch (err: any) {
                    this.logger.warn(`Failed to upsert device ${data.serialNumber}: ${err?.message}`);
                    errors++;
                }
            }
        }

        return Result.ok({ usersProcessed: customers.length, synced, errors });
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /** Crea o actualiza un device en DB a partir de datos de Minerva y lo vincula al usuario */
    private async _upsertAndLink(data: InventoryDeviceData, userId: string): Promise<void> {
        const serial = SerialNumber.reconstitute(data.serialNumber.trim().toUpperCase());
        const found = await this.deviceRepo.findBySerial(data.serialNumber);

        let device: Device;

        if (found.isSuccess && found.unwrap()) {
            device = found.unwrap()!;
        } else {
            const id = crypto.randomUUID() as unknown as DeviceId;
            device = Device.create(id, serial).unwrap();
        }

        device.syncFromSource(
            data.model,
            data.brand,
            data.deviceType,
            data.assignedUser?.userId ?? userId,
            data.assignedUser?.nombre ?? null,
        );
        device.assignToUser(userId);

        const existing = found.isSuccess && found.unwrap();
        if (existing) {
            await this.deviceRepo.update(device);
        } else {
            await this.deviceRepo.save(device);
        }
    }

    /** E → F: consulta API y persiste el resultado */
    private async _syncAndPersist(device: Device): Promise<Result<Device>> {
        let data: InventoryDeviceData | null;

        try {
            data = await this.inventoryService.getBySerial(device.serialNumber.value);
        } catch (err: any) {
            device.markSyncError();
            await this.deviceRepo.update(device);
            return Result.err(new Error(`Inventory API error: ${err?.message ?? err}`));
        }

        if (!data) {
            device.markNotFound();
        } else {
            device.syncFromSource(
                data.model,
                data.brand,
                data.deviceType,
                data.assignedUser?.userId ?? null,
                data.assignedUser?.nombre ?? null,
            );
        }

        const updateResult = await this.deviceRepo.update(device);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(device);
    }
}
