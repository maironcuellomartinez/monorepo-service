// core/domain/entities/device.entity.spec.ts
import { Device } from './device.entity';
import { DeviceStatus } from '../enums/device-status.enum';
import { SerialNumber } from '../value-objects/serial-number.value';
import { DeviceId } from '@app/shared/types/branded-ids';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sn(value = 'SN12345'): SerialNumber {
    return SerialNumber.create(value).unwrap();
}

function freshDevice(): Device {
    return Device.reconstitute(
        DeviceId('dev-1'), sn(),
        'ThinkPad X1', 'Lenovo', 'LAPTOP',
        'usr-1', 'Juan Pérez',
        DeviceStatus.SYNCED, new Date(), new Date(),
    );
}

function staleDevice(): Device {
    return Device.reconstitute(
        DeviceId('dev-1'), sn(),
        'ThinkPad X1', 'Lenovo', 'LAPTOP',
        null, null,
        DeviceStatus.SYNCED, new Date(Date.now() - 20 * 60_000), new Date(),
    );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Device.create()', () => {
    it('nace en estado STALE con lastSyncAt = epoch', () => {
        const device = Device.create(DeviceId('dev-1'), sn()).unwrap();

        expect(device.status).toBe(DeviceStatus.STALE);
        expect(device.lastSyncAt.getTime()).toBe(0);
        expect(device.model).toBeNull();
        expect(device.brand).toBeNull();
        expect(device.assignedUserId).toBeNull();
        expect(device.assignedUserName).toBeNull();
    });

    it('isStale = true inmediatamente después de create()', () => {
        expect(Device.create(DeviceId('dev-1'), sn()).unwrap().isStale).toBe(true);
    });
});

describe('Device.isStale', () => {
    it('false si lastSyncAt es reciente (< 15 min)', () => {
        expect(freshDevice().isStale).toBe(false);
    });

    it('true si lastSyncAt tiene más de 15 min', () => {
        expect(staleDevice().isStale).toBe(true);
    });

    it('false con lastSyncAt a 14 min en el pasado', () => {
        const d = Device.reconstitute(
            DeviceId('d'), sn(), null, null, null, null, null,
            DeviceStatus.SYNCED, new Date(Date.now() - 14 * 60_000), new Date(),
        );
        expect(d.isStale).toBe(false);
    });
});

describe('Device.syncFromSource()', () => {
    it('actualiza todos los campos y pone status SYNCED', () => {
        const device = staleDevice();
        device.syncFromSource('Latitude 5540', 'Dell', 'LAPTOP', 'usr-99', 'Ana López');

        expect(device.model).toBe('Latitude 5540');
        expect(device.brand).toBe('Dell');
        expect(device.deviceType).toBe('LAPTOP');
        expect(device.assignedUserId).toBe('usr-99');
        expect(device.assignedUserName).toBe('Ana López');
        expect(device.status).toBe(DeviceStatus.SYNCED);
    });

    it('lastSyncAt se actualiza → isStale = false', () => {
        const device = staleDevice();
        const before = Date.now();

        device.syncFromSource('M', 'B', 'D', null, null);

        expect(device.lastSyncAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(device.isStale).toBe(false);
    });

    it('acepta null en usuario (device sin asignar)', () => {
        const device = staleDevice();
        device.syncFromSource('M', 'B', 'D', null, null);

        expect(device.assignedUserId).toBeNull();
        expect(device.isAssigned).toBe(false);
    });

    it('isAssigned = true cuando hay usuario asignado', () => {
        const device = staleDevice();
        device.syncFromSource('M', 'B', 'D', 'usr-1', 'Nombre');
        expect(device.isAssigned).toBe(true);
    });
});

describe('Device.markSyncError()', () => {
    it('cambia status a SYNC_ERROR y actualiza lastSyncAt', () => {
        const device = staleDevice();
        const before = Date.now();

        device.markSyncError();

        expect(device.status).toBe(DeviceStatus.SYNC_ERROR);
        expect(device.lastSyncAt.getTime()).toBeGreaterThanOrEqual(before);
    });
});

describe('Device.markNotFound()', () => {
    it('cambia status a NOT_FOUND y actualiza lastSyncAt', () => {
        const device = staleDevice();
        const before = Date.now();

        device.markNotFound();

        expect(device.status).toBe(DeviceStatus.NOT_FOUND);
        expect(device.lastSyncAt.getTime()).toBeGreaterThanOrEqual(before);
    });
});

describe('Device.reconstitute()', () => {
    it('reconstruye el device incluyendo usuario asignado', () => {
        const lastSyncAt = new Date('2026-01-01T10:00:00Z');

        const device = Device.reconstitute(
            DeviceId('dev-x'), sn('RECONSTITUTED'),
            'Surface Pro', 'Microsoft', 'TABLET',
            'usr-42', 'Pedro García',
            DeviceStatus.SYNCED, lastSyncAt, new Date(),
        );

        expect(device.model).toBe('Surface Pro');
        expect(device.assignedUserId).toBe('usr-42');
        expect(device.assignedUserName).toBe('Pedro García');
        expect(device.isAssigned).toBe(true);
        expect(device.lastSyncAt).toEqual(lastSyncAt);
    });

    it('reconstitute sin usuario asignado → isAssigned = false', () => {
        const device = Device.reconstitute(
            DeviceId('d'), sn(), null, null, null, null, null,
            DeviceStatus.NOT_FOUND, new Date(), new Date(),
        );
        expect(device.isAssigned).toBe(false);
    });
});

describe('Device helpers', () => {
    it('hasModel() = true si model no es null', () => {
        expect(freshDevice().hasModel()).toBe(true);
    });

    it('hasDeviceType() = true si deviceType no es null', () => {
        expect(freshDevice().hasDeviceType()).toBe(true);
    });

    it('hasModel() = false si model es null', () => {
        const d = Device.reconstitute(
            DeviceId('d'), sn(), null, null, null, null, null,
            DeviceStatus.NOT_FOUND, new Date(), new Date(),
        );
        expect(d.hasModel()).toBe(false);
    });

    it('matchesSerialNumber() compara el valor', () => {
        expect(freshDevice().matchesSerialNumber('SN12345')).toBe(true);
        expect(freshDevice().matchesSerialNumber('OTHER')).toBe(false);
    });
});
