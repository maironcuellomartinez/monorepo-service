// core/services/availability/availability.service.spec.ts
import { AvailabilityService } from './availability.service';
import { AvailabilityQuery } from '../../ports/incoming/availability/availability-service.port';
import { Result } from '@app/result';
import { IncidentStatus } from '../../domain/enums/incident-status.enum';
import { CornerId, TechnicianId, IncidentId, SlotId } from '@app/shared/types/branded-ids';
import { DateRange } from '../../domain/value-objects/date-range.value';

// ─── Factories de mocks ───────────────────────────────────────────────────────

// Returns a date 30 days from now at the given UTC hour:minute, so slots are always in the future.
function futureDateAt(hh: number, mm: number): Date {
    const d = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    d.setUTCHours(hh, mm, 0, 0);
    return d;
}

function makeSlot(start: Date, end: Date, status: 'AVAILABLE' | 'BOOKED' = 'AVAILABLE') {
    return {
        id: SlotId(`slot-${start.getTime()}`),
        timeRange: { start, end },
        status,
        isAvailableForUser: (_userId?: string) => status === 'AVAILABLE',
    };
}

function makeSlots(dayStart: Date, count: number, slotMinutes = 15, status: 'AVAILABLE' | 'BOOKED' = 'AVAILABLE') {
    return Array.from({ length: count }, (_, i) => {
        const start = new Date(dayStart.getTime() + i * slotMinutes * 60_000);
        const end = new Date(start.getTime() + slotMinutes * 60_000);
        return makeSlot(start, end, status);
    });
}

function makeCorner(slotDurationMinutes = 15) {
    return { id: CornerId('corner-1'), slotDurationMinutes } as any;
}

function makeTechnician(id: string) {
    return { id: TechnicianId(id), name: `Tech ${id}` } as any;
}

function makeIncident(techId: string, start: Date, end: Date, status = IncidentStatus.IN_PROGRESS) {
    return {
        id: IncidentId(`inc-${techId}`),
        status,
        currentTechnicianId: TechnicianId(techId),
        scheduledRange: DateRange.reconstitute(start, end),
    } as any;
}

// ─── Builder de repos mock ────────────────────────────────────────────────────

function buildMocks(overrides?: {
    corner?: any;
    slots?: any[];
    technicians?: any[];
    incidents?: any[];
    cacheValue?: any;
}) {
    const corner = overrides?.corner ?? makeCorner();
    const slots = overrides?.slots ?? [];
    const technicians = overrides?.technicians ?? [];
    const incidents = overrides?.incidents ?? [];

    const cornerRepo = { findById: jest.fn().mockResolvedValue(Result.ok(corner)) };
    const slotRepo = {
        findByCornerAndDate: jest.fn().mockResolvedValue(Result.ok(slots)),
        findConsecutiveSlots: jest.fn().mockResolvedValue(Result.ok(slots)),
    };
    const technicianRepo = { findByCorner: jest.fn().mockResolvedValue(Result.ok(technicians)) };
    const incidentRepo = { findByDateRange: jest.fn().mockResolvedValue(Result.ok(incidents)) };
    const cache = {
        get: jest.fn().mockResolvedValue(
            overrides?.cacheValue !== undefined
                ? Result.ok(overrides.cacheValue)
                : Result.ok(null)
        ),
        set: jest.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const service = new AvailabilityService(
        cornerRepo as any,
        slotRepo as any,
        technicianRepo as any,
        incidentRepo as any,
        cache as any,
    );

    return { service, cornerRepo, slotRepo, technicianRepo, incidentRepo, cache };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AvailabilityService.getAvailability()', () => {
    const query: AvailabilityQuery = {
        cornerId: 'corner-1',
        date: new Date('2026-03-09'),
        duration: 30,
    };

    it('retorna del caché si existe', async () => {
        const cached = [{ startTime: new Date(), endTime: new Date(), available: true }];
        const { service, slotRepo } = buildMocks({ cacheValue: cached });

        const result = await service.getAvailability(query);

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap()).toBe(cached);
        expect(slotRepo.findByCornerAndDate).not.toHaveBeenCalled();
    });

    it('guarda en caché cuando no existe', async () => {
        const dayStart = new Date('2026-03-09T09:00:00Z');
        const slots = makeSlots(dayStart, 4); // 4 slots de 15 min = 1 hora

        const { service, cache } = buildMocks({ slots });

        await service.getAvailability(query);

        expect(cache.set).toHaveBeenCalledTimes(1);
        const [key, , ttl] = cache.set.mock.calls[0];
        expect(key).toContain('availability:corner-1');
        expect(ttl).toBe(30);
    });

    it('retorna error si el corner no existe', async () => {
        const cornerRepo = { findById: jest.fn().mockResolvedValue(Result.ok(null)) };
        const slotRepo = { findByCornerAndDate: jest.fn() };
        const technicianRepo = { findByCorner: jest.fn() };
        const incidentRepo = { findByDateRange: jest.fn() };
        const cache = {
            get: jest.fn().mockResolvedValue(Result.ok(null)),
            set: jest.fn(),
        };

        const service = new AvailabilityService(
            cornerRepo as any,
            slotRepo as any,
            technicianRepo as any,
            incidentRepo as any,
            cache as any,
        );

        const result = await service.getAvailability(query);
        expect(result.isFailure).toBe(true);
    });
});

describe('AvailabilityService — ventana deslizante', () => {
    const dayStart = futureDateAt(9, 0);
    const futureDate = new Date(dayStart);
    futureDate.setUTCHours(0, 0, 0, 0);
    const query: AvailabilityQuery = { cornerId: 'corner-1', date: futureDate, duration: 30 };

    it('retorna [] si no hay slots', async () => {
        const { service } = buildMocks({ slots: [] });
        const result = await service.getAvailability(query);
        expect(result.unwrap()).toHaveLength(0);
    });

    it('genera ventanas de 2 slots para duración de 30 min (slots 15 min)', async () => {
        const slots = makeSlots(dayStart, 4); // 4 slots → 3 ventanas posibles
        const { service } = buildMocks({ slots });

        const result = await service.getAvailability(query);
        const windows = result.unwrap();

        expect(windows).toHaveLength(3);
        expect(windows[0].startTime).toEqual(slots[0].timeRange.start);
        expect(windows[0].endTime).toEqual(slots[1].timeRange.end);
    });

    it('marca una ventana como no disponible si tiene slots BOOKED', async () => {
        const slots = [
            makeSlot(futureDateAt(9, 0), futureDateAt(9, 15), 'BOOKED'),
            makeSlot(futureDateAt(9, 15), futureDateAt(9, 30), 'AVAILABLE'),
            makeSlot(futureDateAt(9, 30), futureDateAt(9, 45), 'AVAILABLE'),
        ];
        // Técnico libre para que la segunda ventana sea disponible
        const technicians = [makeTechnician('tech-1')];

        const { service } = buildMocks({ slots, technicians });
        const result = await service.getAvailability(query);
        const windows = result.unwrap();

        // Primera ventana [slot0, slot1] contiene BOOKED → no disponible
        expect(windows[0].available).toBe(false);
        expect(windows[0].occupiedSlots).toHaveLength(1);

        // Segunda ventana [slot1, slot2] todos AVAILABLE y técnico libre → disponible
        expect(windows[1].available).toBe(true);
    });

    it('descarta ventanas con slots no consecutivos', async () => {
        // Hueco entre slot1 y slot2 (30 min en lugar de 15)
        const slots = [
            makeSlot(futureDateAt(9, 0), futureDateAt(9, 15)),
            makeSlot(futureDateAt(9, 45), futureDateAt(10, 0)), // no consecutivo
            makeSlot(futureDateAt(10, 0), futureDateAt(10, 15)),
        ];

        const { service } = buildMocks({ slots });
        const result = await service.getAvailability(query);
        const windows = result.unwrap();

        // [slot0,slot1] no consecutivos → descartada
        // [slot1,slot2] consecutivos → incluida
        expect(windows).toHaveLength(1);
        expect(windows[0].startTime).toEqual(slots[1].timeRange.start);
    });
});

describe('AvailabilityService — disponibilidad de técnicos', () => {
    const dayStart = futureDateAt(9, 0);
    const futureDate = new Date(dayStart);
    futureDate.setUTCHours(0, 0, 0, 0);
    const query: AvailabilityQuery = { cornerId: 'corner-1', date: futureDate, duration: 30 };

    it('ventana disponible = slots libres Y técnicos disponibles', async () => {
        const slots = makeSlots(dayStart, 2);
        const technicians = [makeTechnician('tech-1'), makeTechnician('tech-2')];
        // Sin incidencias activas → ambos técnicos libres
        const { service } = buildMocks({ slots, technicians });

        const result = await service.getAvailability(query);
        const [window] = result.unwrap();

        expect(window.available).toBe(true);
        expect(window.technicians.available).toBe(2);
        expect(window.technicians.availableNames).toEqual(['Tech tech-1', 'Tech tech-2']);
    });

    it('ventana no disponible si todos los técnicos están ocupados', async () => {
        const slots = makeSlots(dayStart, 2);
        const windowStart = slots[0].timeRange.start;
        const windowEnd = slots[1].timeRange.end;

        const technicians = [makeTechnician('tech-1')];
        const incidents = [
            makeIncident('tech-1', windowStart, windowEnd), // ocupa toda la ventana
        ];

        const { service } = buildMocks({ slots, technicians, incidents });
        const result = await service.getAvailability(query);
        const [window] = result.unwrap();

        expect(window.available).toBe(false);
        expect(window.technicians.available).toBe(0);
        expect(window.technicians.occupied).toHaveLength(1);
    });

    it('ventana disponible si al menos un técnico está libre', async () => {
        const slots = makeSlots(dayStart, 2);
        const windowStart = slots[0].timeRange.start;
        const windowEnd = slots[1].timeRange.end;

        const technicians = [makeTechnician('tech-1'), makeTechnician('tech-2')];
        const incidents = [
            makeIncident('tech-1', windowStart, windowEnd), // solo tech-1 ocupado
        ];

        const { service } = buildMocks({ slots, technicians, incidents });
        const result = await service.getAvailability(query);
        const [window] = result.unwrap();

        expect(window.available).toBe(true);
        expect(window.technicians.available).toBe(1);
        expect(window.technicians.occupied).toHaveLength(1);
    });

    it('ignora incidencias CANCELED y CLOSED al calcular ocupación', async () => {
        const slots = makeSlots(dayStart, 2);
        const windowStart = slots[0].timeRange.start;
        const windowEnd = slots[1].timeRange.end;

        const technicians = [makeTechnician('tech-1')];
        const incidents = [
            makeIncident('tech-1', windowStart, windowEnd, IncidentStatus.CANCELED),
            makeIncident('tech-1', windowStart, windowEnd, IncidentStatus.CLOSED),
        ];

        const { service } = buildMocks({ slots, technicians, incidents });
        const result = await service.getAvailability(query);
        const [window] = result.unwrap();

        // Las incidencias canceladas/cerradas no bloquean técnicos
        expect(window.technicians.available).toBe(1);
    });
});

describe('AvailabilityService.getTechniciansAvailability()', () => {
    it('retorna técnico libre si no tiene incidencia activa', async () => {
        const { service, technicianRepo, incidentRepo } = buildMocks({
            technicians: [makeTechnician('tech-1')],
            incidents: [],
        });

        const result = await service.getTechniciansAvailability('corner-1', new Date());

        expect(result.isSuccess).toBe(true);
        const [tech] = result.unwrap();
        expect(tech.available).toBe(true);
        expect(tech.technicianId).toBe('tech-1');
    });

    it('retorna técnico ocupado si tiene incidencia IN_PROGRESS', async () => {
        const now = new Date();
        const end = new Date(now.getTime() + 30 * 60_000);
        const incidents = [makeIncident('tech-1', now, end, IncidentStatus.IN_PROGRESS)];

        const { service } = buildMocks({
            technicians: [makeTechnician('tech-1')],
            incidents,
        });

        const result = await service.getTechniciansAvailability('corner-1', new Date());
        const [tech] = result.unwrap();

        expect(tech.available).toBe(false);
        expect(tech.occupiedUntil).toBeDefined();
    });
});

describe('AvailabilityService.checkSlotAvailability()', () => {
    it('retorna true si hay slots consecutivos disponibles', async () => {
        const { service } = buildMocks({
            slots: makeSlots(new Date(), 2),
        });

        const result = await service.checkSlotAvailability('corner-1', new Date(), 30);
        expect(result.unwrap()).toBe(true);
    });

    it('retorna false si no hay slots', async () => {
        const slotRepo = { findConsecutiveSlots: jest.fn().mockResolvedValue(Result.ok([])) };
        const service = new AvailabilityService(
            {} as any, slotRepo as any, {} as any, {} as any, {} as any,
        );

        const result = await service.checkSlotAvailability('corner-1', new Date(), 30);
        expect(result.unwrap()).toBe(false);
    });
});
