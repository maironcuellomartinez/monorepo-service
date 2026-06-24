// core/domain/entities/slot.entity.spec.ts
import { Slot } from './slot.entity';
import { SlotStatus } from '../enums/slot-status.enum';
import { DateRange } from '../value-objects/date-range.value';
import { SlotId, CornerId, ScheduleId } from '@app/shared/types/branded-ids';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function futureRange(offsetMin = 60, durationMin = 15): DateRange {
    const start = new Date(Date.now() + offsetMin * 60_000);
    const end = new Date(start.getTime() + durationMin * 60_000);
    return DateRange.reconstitute(start, end);
}

function pastRange(): DateRange {
    const end = new Date(Date.now() - 60_000);
    const start = new Date(end.getTime() - 15 * 60_000);
    return DateRange.reconstitute(start, end);
}

function makeSlot(status?: SlotStatus, range?: DateRange): Slot {
    const r = range ?? futureRange();
    const s = status ?? SlotStatus.AVAILABLE;
    // create() rechaza rangos pasados, usar reconstitute() para tests con rangos pasados
    if (s === SlotStatus.AVAILABLE && !range) {
        return Slot.create(SlotId('slot-1'), CornerId('corner-1'), ScheduleId('sched-1'), r).unwrap();
    }
    return Slot.reconstitute(
        SlotId('slot-1'), CornerId('corner-1'), ScheduleId('sched-1'),
        r, s, new Date(), new Date(),
    );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Slot.create()', () => {
    it('crea un slot AVAILABLE en el futuro', () => {
        const result = Slot.create(SlotId('s-1'), CornerId('c-1'), ScheduleId('sc-1'), futureRange());

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().status).toBe(SlotStatus.AVAILABLE);
    });

    it('falla si el rango está en el pasado', () => {
        const result = Slot.create(SlotId('s-1'), CornerId('c-1'), ScheduleId('sc-1'), pastRange());

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/past/i);
    });
});

describe('Slot.isAvailable()', () => {
    it('retorna true para slot AVAILABLE en el futuro', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).isAvailable()).toBe(true);
    });

    it('retorna false para slot BOOKED', () => {
        expect(makeSlot(SlotStatus.BOOKED).isAvailable()).toBe(false);
    });

    it('retorna false para slot EXPIRED', () => {
        expect(makeSlot(SlotStatus.EXPIRED).isAvailable()).toBe(false);
    });

    it('retorna false para slot AVAILABLE con rango en el pasado', () => {
        const slot = makeSlot(SlotStatus.AVAILABLE, pastRange());
        expect(slot.isAvailable()).toBe(false);
    });
});

describe('Slot.isExpired()', () => {
    it('retorna true si el status es EXPIRED', () => {
        expect(makeSlot(SlotStatus.EXPIRED).isExpired()).toBe(true);
    });

    it('retorna true si la fecha de fin ya pasó (aunque no sea EXPIRED)', () => {
        const slot = makeSlot(SlotStatus.AVAILABLE, pastRange());
        expect(slot.isExpired()).toBe(true);
    });

    it('retorna false para slot futuro AVAILABLE', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).isExpired()).toBe(false);
    });
});

describe('Slot.canBeBooked()', () => {
    it('retorna true solo si está disponible y no expirado', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).canBeBooked()).toBe(true);
    });

    it('retorna false si está BOOKED', () => {
        expect(makeSlot(SlotStatus.BOOKED).canBeBooked()).toBe(false);
    });

    it('retorna false si está AVAILABLE pero en el pasado', () => {
        expect(makeSlot(SlotStatus.AVAILABLE, pastRange()).canBeBooked()).toBe(false);
    });
});

describe('Slot.book()', () => {
    it('cambia estado a BOOKED', () => {
        const slot = makeSlot();

        const result = slot.book();

        expect(result.isSuccess).toBe(true);
        expect(slot.status).toBe(SlotStatus.BOOKED);
        expect(slot.isBooked()).toBe(true);
    });

    it('falla si ya está BOOKED', () => {
        const slot = makeSlot(SlotStatus.BOOKED);

        expect(slot.book().isFailure).toBe(true);
    });

    it('falla si está EXPIRED', () => {
        const slot = makeSlot(SlotStatus.EXPIRED);

        expect(slot.book().isFailure).toBe(true);
    });

    it('falla si está AVAILABLE pero en el pasado', () => {
        const slot = makeSlot(SlotStatus.AVAILABLE, pastRange());

        expect(slot.book().isFailure).toBe(true);
    });
});

describe('Slot.release()', () => {
    it('BOOKED → AVAILABLE', () => {
        const slot = makeSlot(SlotStatus.BOOKED);

        const result = slot.release();

        expect(result.isSuccess).toBe(true);
        expect(slot.status).toBe(SlotStatus.AVAILABLE);
    });

    it('falla si no está BOOKED', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).release().isFailure).toBe(true);
        expect(makeSlot(SlotStatus.EXPIRED).release().isFailure).toBe(true);
    });
});

describe('Slot.expire()', () => {
    it('marca el slot como EXPIRED', () => {
        const slot = makeSlot();

        slot.expire();

        expect(slot.status).toBe(SlotStatus.EXPIRED);
        expect(slot.isExpired()).toBe(true);
    });

    it('un slot EXPIRED no puede ser reservado', () => {
        const slot = makeSlot();
        slot.expire();

        expect(slot.book().isFailure).toBe(true);
    });
});

// ─── Helpers para HELD ────────────────────────────────────────────────────────

function futureDate(offsetMin = 15): Date {
    return new Date(Date.now() + offsetMin * 60_000);
}

function pastDate(offsetMin = 5): Date {
    return new Date(Date.now() - offsetMin * 60_000);
}

function makeHeldSlot(userId: string, expiredHold = false): Slot {
    return Slot.reconstitute(
        SlotId('slot-1'), CornerId('corner-1'), ScheduleId('sched-1'),
        futureRange(),
        SlotStatus.HELD,
        new Date(),
        new Date(),
        userId,
        expiredHold ? pastDate(5) : futureDate(15),
    );
}

// ─── Tests HELD ───────────────────────────────────────────────────────────────

describe('Slot.hold()', () => {
    it('AVAILABLE → HELD y registra userId y TTL', () => {
        const slot = makeSlot(SlotStatus.AVAILABLE);

        const result = slot.hold('user-1', 15);

        expect(result.isSuccess).toBe(true);
        expect(slot.status).toBe(SlotStatus.HELD);
        expect(slot.heldByUserId).toBe('user-1');
        expect(slot.heldUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('puede reclamar un hold expirado (lazy expiration)', () => {
        const slot = makeHeldSlot('other-user', true /* expired */);

        const result = slot.hold('user-1', 15);

        expect(result.isSuccess).toBe(true);
        expect(slot.heldByUserId).toBe('user-1');
    });

    it('no puede holdear un slot HELD vigente de otro usuario', () => {
        const slot = makeHeldSlot('other-user', false /* vigente */);

        const result = slot.hold('user-1', 15);

        expect(result.isFailure).toBe(true);
    });

    it('no puede holdear un slot BOOKED', () => {
        const slot = makeSlot(SlotStatus.BOOKED);

        expect(slot.hold('user-1', 15).isFailure).toBe(true);
    });
});

describe('Slot.releaseHold()', () => {
    it('libera el hold del usuario dueño → AVAILABLE', () => {
        const slot = makeHeldSlot('user-1');

        const result = slot.releaseHold('user-1');

        expect(result.isSuccess).toBe(true);
        expect(slot.status).toBe(SlotStatus.AVAILABLE);
        expect(slot.heldByUserId).toBeNull();
        expect(slot.heldUntil).toBeNull();
    });

    it('no puede liberar el hold de otro usuario', () => {
        const slot = makeHeldSlot('user-1');

        const result = slot.releaseHold('user-2');

        expect(result.isFailure).toBe(true);
        expect(slot.status).toBe(SlotStatus.HELD);
    });

    it('falla si el slot no está HELD', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).releaseHold('user-1').isFailure).toBe(true);
    });
});

describe('Slot.isHeldBy()', () => {
    it('true para el usuario dueño con hold vigente', () => {
        expect(makeHeldSlot('user-1').isHeldBy('user-1')).toBe(true);
    });

    it('false para otro usuario', () => {
        expect(makeHeldSlot('user-1').isHeldBy('user-2')).toBe(false);
    });

    it('false si el slot no está HELD', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).isHeldBy('user-1')).toBe(false);
    });
});

describe('Slot.isHoldExpired()', () => {
    it('true cuando held_until ya pasó', () => {
        expect(makeHeldSlot('user-1', true).isHoldExpired()).toBe(true);
    });

    it('false cuando held_until es futuro', () => {
        expect(makeHeldSlot('user-1', false).isHoldExpired()).toBe(false);
    });

    it('false cuando el slot no está HELD', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).isHoldExpired()).toBe(false);
    });
});

describe('Slot.isAvailableForUser() — hold-aware', () => {
    it('true para slot AVAILABLE sin usuario', () => {
        expect(makeSlot(SlotStatus.AVAILABLE).isAvailableForUser()).toBe(true);
    });

    it('true para slot HELD por el mismo usuario', () => {
        expect(makeHeldSlot('user-1').isAvailableForUser('user-1')).toBe(true);
    });

    it('true para slot HELD con hold expirado (cualquier usuario)', () => {
        const slot = makeHeldSlot('other-user', true);
        expect(slot.isAvailableForUser('user-1')).toBe(true);
        expect(slot.isAvailableForUser()).toBe(true);
    });

    it('false para slot HELD por otro usuario con hold vigente', () => {
        const slot = makeHeldSlot('user-1');
        expect(slot.isAvailableForUser('user-2')).toBe(false);
        expect(slot.isAvailableForUser()).toBe(false);
    });

    it('false para slot BOOKED', () => {
        expect(makeSlot(SlotStatus.BOOKED).isAvailableForUser('user-1')).toBe(false);
    });
});

describe('Slot.book() y release() limpian campos hold', () => {
    it('book() limpia heldByUserId y heldUntil', () => {
        const slot = makeSlot(SlotStatus.AVAILABLE);
        slot.book();

        expect(slot.heldByUserId).toBeNull();
        expect(slot.heldUntil).toBeNull();
    });

    it('release() limpia heldByUserId y heldUntil', () => {
        const slot = makeSlot(SlotStatus.BOOKED);
        slot.release();

        expect(slot.heldByUserId).toBeNull();
        expect(slot.heldUntil).toBeNull();
    });
});

describe('Slot.isWithinRange()', () => {
    it('retorna true cuando el slot está completamente dentro del rango', () => {
        const outerRange = futureRange(30, 120); // 30min → 150min
        const slotRange = futureRange(60, 15);   // 60min → 75min
        const slot = Slot.reconstitute(
            SlotId('s-1'), CornerId('c-1'), ScheduleId('sc-1'),
            slotRange, SlotStatus.AVAILABLE, new Date(), new Date(),
        );

        expect(slot.isWithinRange(outerRange)).toBe(true);
    });

    it('retorna false cuando el slot está fuera del rango', () => {
        const outerRange = futureRange(30, 20); // 30min → 50min
        const slotRange = futureRange(60, 15);  // 60min → 75min
        const slot = Slot.reconstitute(
            SlotId('s-1'), CornerId('c-1'), ScheduleId('sc-1'),
            slotRange, SlotStatus.AVAILABLE, new Date(), new Date(),
        );

        expect(slot.isWithinRange(outerRange)).toBe(false);
    });
});
