// core/services/device/device.service.spec.ts
import { DeviceService } from './device.service';
import { DeviceStatus } from '../../domain/enums/device-status.enum';
import { Device } from '../../domain/entities/device.entity';
import { Result } from '@app/result';
import { DeviceId } from '@app/shared/types/branded-ids';
import { SerialNumber } from '../../domain/value-objects/serial-number.value';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SERIAL = 'SN12345';

function makeDevice(opts?: { stale?: boolean; status?: DeviceStatus }): Device {
    const lastSyncAt = opts?.stale
        ? new Date(Date.now() - 20 * 60_000)
        : new Date();

    return Device.reconstitute(
        DeviceId('dev-1'),
        SerialNumber.create(SERIAL).unwrap(),
        'ThinkPad', 'Lenovo', 'LAPTOP',
        'usr-1', 'Juan Pérez',
        opts?.status ?? DeviceStatus.SYNCED,
        false,
        lastSyncAt,
        new Date(),
    );
}

const INVENTORY_DATA = {
    model: 'Model X',
    brand: 'Brand Y',
    deviceType: 'LAPTOP',
    assignedUser: { userId: 'usr-1', nombre: 'Juan Pérez' },
};

function buildMocks(opts?: {
    dbDevice?: Device | null;
    inventoryData?: typeof INVENTORY_DATA | null;
    inventoryThrows?: boolean;
    updateFails?: boolean;
    saveFails?: boolean;
    staleDevices?: Device[];
}) {
    const deviceRepo = {
        findBySerial: jest.fn().mockResolvedValue(Result.ok(opts?.dbDevice ?? null)),
        findStaleEntries: jest.fn().mockResolvedValue(Result.ok(opts?.staleDevices ?? [])),
        save: jest.fn().mockResolvedValue(
            opts?.saveFails ? Result.err(new Error('DB save error')) : Result.ok(undefined),
        ),
        update: jest.fn().mockResolvedValue(
            opts?.updateFails ? Result.err(new Error('DB update error')) : Result.ok(undefined),
        ),
    };

    const inventoryService = {
        getBySerial: opts?.inventoryThrows
            ? jest.fn().mockRejectedValue(new Error('API down'))
            : jest.fn().mockResolvedValue(opts?.inventoryData === undefined ? INVENTORY_DATA : opts.inventoryData),
    };

    const service = new DeviceService(deviceRepo as any, inventoryService as any);
    return { service, deviceRepo, inventoryService };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DeviceService.resolveDevice() — flowchart completo', () => {

    describe('B: No está en DB', () => {
        it('consulta la API y guarda en DB', async () => {
            const { service, deviceRepo, inventoryService } = buildMocks({ dbDevice: null });

            const result = await service.resolveDevice(SERIAL);

            expect(result.isSuccess).toBe(true);
            expect(inventoryService.getBySerial).toHaveBeenCalledWith(SERIAL);
            expect(deviceRepo.save).toHaveBeenCalledTimes(1);
            expect(result.unwrap()?.status).toBe(DeviceStatus.SYNCED);
            expect(result.unwrap()?.model).toBe('Model X');
        });

        it('retorna null si la API tampoco lo conoce', async () => {
            const { service } = buildMocks({ dbDevice: null, inventoryData: null });

            const result = await service.resolveDevice(SERIAL);

            expect(result.isSuccess).toBe(true);
            expect(result.unwrap()).toBeNull();
        });

        it('falla si la API lanza error', async () => {
            const { service } = buildMocks({ dbDevice: null, inventoryThrows: true });

            const result = await service.resolveDevice(SERIAL);

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError().message).toMatch(/Inventory API error/i);
        });
    });

    describe('C: En DB, ≥15 min (stale) → refresca', () => {
        it('llama a la API y actualiza DB', async () => {
            const stale = makeDevice({ stale: true });
            const { service, inventoryService, deviceRepo } = buildMocks({ dbDevice: stale });

            const result = await service.resolveDevice(SERIAL);

            expect(inventoryService.getBySerial).toHaveBeenCalledWith(SERIAL);
            expect(deviceRepo.update).toHaveBeenCalledTimes(1);
            expect(deviceRepo.save).not.toHaveBeenCalled();
            expect(result.unwrap()?.status).toBe(DeviceStatus.SYNCED);
        });

        it('marca SYNC_ERROR si la API falla en refresh', async () => {
            const stale = makeDevice({ stale: true });
            const { service, deviceRepo } = buildMocks({ dbDevice: stale, inventoryThrows: true });

            const result = await service.resolveDevice(SERIAL);

            expect(result.isFailure).toBe(true);
            expect(deviceRepo.update).toHaveBeenCalledTimes(1); // persiste el error
        });

        it('marca NOT_FOUND si la API ya no lo conoce', async () => {
            const stale = makeDevice({ stale: true });
            const { service } = buildMocks({ dbDevice: stale, inventoryData: null });

            const result = await service.resolveDevice(SERIAL);

            expect(result.isSuccess).toBe(true);
            expect(result.unwrap()?.status).toBe(DeviceStatus.NOT_FOUND);
        });
    });

    describe('C: En DB, <15 min (fresco) → devuelve desde DB', () => {
        it('no llama a la API ni actualiza DB', async () => {
            const fresh = makeDevice({ stale: false });
            const { service, inventoryService, deviceRepo } = buildMocks({ dbDevice: fresh });

            const result = await service.resolveDevice(SERIAL);

            expect(inventoryService.getBySerial).not.toHaveBeenCalled();
            expect(deviceRepo.update).not.toHaveBeenCalled();
            expect(result.unwrap()?.serialNumber.value).toBe(SERIAL);
        });
    });
});

describe('DeviceService.syncDevice()', () => {
    it('fuerza la sincronización aunque el device esté fresco', async () => {
        const fresh = makeDevice({ stale: false });
        const { service, inventoryService } = buildMocks({ dbDevice: fresh });

        const result = await service.syncDevice(SERIAL);

        expect(result.isSuccess).toBe(true);
        expect(inventoryService.getBySerial).toHaveBeenCalledWith(SERIAL);
    });

    it('falla si el device no existe en DB', async () => {
        const { service } = buildMocks({ dbDevice: null });

        const result = await service.syncDevice(SERIAL);

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/not found/i);
    });
});

describe('DeviceService.refreshStaleDevices()', () => {
    it('retorna { refreshed: 0, errors: 0 } si no hay stale', async () => {
        const { service } = buildMocks({ staleDevices: [] });

        const result = await service.refreshStaleDevices();

        expect(result.unwrap()).toEqual({ refreshed: 0, errors: 0 });
    });

    it('cuenta refreshed y errors correctamente', async () => {
        const stale1 = makeDevice({ stale: true });
        const stale2 = makeDevice({ stale: true });

        const deviceRepo = {
            findStaleEntries: jest.fn().mockResolvedValue(Result.ok([stale1, stale2])),
            update: jest.fn().mockResolvedValue(Result.ok(undefined)),
            save: jest.fn(),
            findBySerial: jest.fn(),
            findById: jest.fn(),
            delete: jest.fn(),
        };

        const inventoryService = {
            getBySerial: jest.fn()
                .mockResolvedValueOnce(INVENTORY_DATA)           // stale1 → ok
                .mockRejectedValueOnce(new Error('API down')),   // stale2 → error
            getDevicesByUser: jest.fn(),
        };

        const service = new DeviceService(deviceRepo as any, inventoryService as any);
        const result = await service.refreshStaleDevices();

        expect(result.unwrap()).toEqual({ refreshed: 1, errors: 1 });
    });
});
