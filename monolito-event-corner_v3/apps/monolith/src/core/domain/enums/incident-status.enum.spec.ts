// core/domain/enums/incident-status.enum.spec.ts
import {
    IncidentStatus,
    canTransitionTo,
    isTakeableStatus,
    isTerminalStatus,
    isActiveStatus,
    TAKEABLE_STATUSES,
    TERMINAL_STATUSES,
} from './incident-status.enum';

describe('canTransitionTo()', () => {
    // ── Transiciones válidas ──────────────────────────────────────────────────
    const validTransitions: [IncidentStatus, IncidentStatus][] = [
        // Inicio del flujo
        [IncidentStatus.CREATED,   IncidentStatus.DELIVERED],
        [IncidentStatus.CREATED,   IncidentStatus.CANCELED],
        // Desde DELIVERED
        [IncidentStatus.DELIVERED, IncidentStatus.IN_PROGRESS],
        [IncidentStatus.DELIVERED, IncidentStatus.PENDING_THIRD_PARTY],
        [IncidentStatus.DELIVERED, IncidentStatus.PENDING_USER],
        [IncidentStatus.DELIVERED, IncidentStatus.PENDING_SPARE_PART],
        // Desde IN_PROGRESS
        [IncidentStatus.IN_PROGRESS, IncidentStatus.PENDING_THIRD_PARTY],
        [IncidentStatus.IN_PROGRESS, IncidentStatus.PENDING_USER],
        [IncidentStatus.IN_PROGRESS, IncidentStatus.PENDING_SPARE_PART],
        [IncidentStatus.IN_PROGRESS, IncidentStatus.PENDING_PICKUP],
        [IncidentStatus.IN_PROGRESS, IncidentStatus.PENDING_REPLACEMENT_DELIVERY],
        // Vuelta a IN_PROGRESS desde pendientes
        [IncidentStatus.PENDING_THIRD_PARTY, IncidentStatus.IN_PROGRESS],
        [IncidentStatus.PENDING_USER,        IncidentStatus.IN_PROGRESS],
        [IncidentStatus.PENDING_SPARE_PART,  IncidentStatus.IN_PROGRESS],
        // Pre-cierre → cierre
        [IncidentStatus.PENDING_PICKUP,               IncidentStatus.CLOSED],
        [IncidentStatus.PENDING_REPLACEMENT_DELIVERY, IncidentStatus.CLOSED],
        // Reapertura
        [IncidentStatus.REOPENED, IncidentStatus.IN_PROGRESS],
    ];

    validTransitions.forEach(([from, to]) => {
        it(`${from} → ${to} es válida`, () => {
            expect(canTransitionTo(from, to)).toBe(true);
        });
    });

    // ── Transiciones inválidas ────────────────────────────────────────────────
    const invalidTransitions: [IncidentStatus, IncidentStatus][] = [
        [IncidentStatus.CREATED,   IncidentStatus.IN_PROGRESS],   // debe pasar por DELIVERED
        [IncidentStatus.CREATED,   IncidentStatus.CLOSED],
        [IncidentStatus.CREATED,   IncidentStatus.VALIDATED],
        [IncidentStatus.IN_PROGRESS, IncidentStatus.CLOSED],       // debe ir por PENDING_PICKUP
        [IncidentStatus.IN_PROGRESS, IncidentStatus.CANCELED],
        [IncidentStatus.PENDING_THIRD_PARTY, IncidentStatus.CLOSED],
        [IncidentStatus.PENDING_USER,        IncidentStatus.CLOSED],
        [IncidentStatus.PENDING_SPARE_PART,  IncidentStatus.CLOSED],
        [IncidentStatus.CLOSED, IncidentStatus.IN_PROGRESS],       // debe reabrir primero
        [IncidentStatus.CANCELED, IncidentStatus.CREATED],
        [IncidentStatus.VALIDATED, IncidentStatus.REOPENED],
        [IncidentStatus.REOPENED, IncidentStatus.CANCELED],
    ];

    invalidTransitions.forEach(([from, to]) => {
        it(`${from} → ${to} es inválida`, () => {
            expect(canTransitionTo(from, to)).toBe(false);
        });
    });

    it('CANCELED no permite ninguna transición', () => {
        Object.values(IncidentStatus).forEach(to => {
            expect(canTransitionTo(IncidentStatus.CANCELED, to)).toBe(false);
        });
    });

    it('VALIDATED no permite ninguna transición', () => {
        Object.values(IncidentStatus).forEach(to => {
            expect(canTransitionTo(IncidentStatus.VALIDATED, to)).toBe(false);
        });
    });

    it('CLOSED no permite transiciones via changeStatus (solo por reopen/validate)', () => {
        Object.values(IncidentStatus).forEach(to => {
            expect(canTransitionTo(IncidentStatus.CLOSED, to)).toBe(false);
        });
    });
});

describe('isTakeableStatus()', () => {
    it('retorna true para todos los estados en TAKEABLE_STATUSES', () => {
        TAKEABLE_STATUSES.forEach(status => {
            expect(isTakeableStatus(status)).toBe(true);
        });
    });

    it('retorna false para CANCELED', () => {
        expect(isTakeableStatus(IncidentStatus.CANCELED)).toBe(false);
    });

    it('retorna false para VALIDATED', () => {
        expect(isTakeableStatus(IncidentStatus.VALIDATED)).toBe(false);
    });
});

describe('isTerminalStatus()', () => {
    it('retorna true para todos los estados terminales', () => {
        TERMINAL_STATUSES.forEach(status => {
            expect(isTerminalStatus(status)).toBe(true);
        });
    });

    it('retorna false para CREATED, DELIVERED, IN_PROGRESS', () => {
        [IncidentStatus.CREATED, IncidentStatus.DELIVERED, IncidentStatus.IN_PROGRESS].forEach(s => {
            expect(isTerminalStatus(s)).toBe(false);
        });
    });
});

describe('isActiveStatus()', () => {
    it('retorna false para CANCELED y VALIDATED', () => {
        expect(isActiveStatus(IncidentStatus.CANCELED)).toBe(false);
        expect(isActiveStatus(IncidentStatus.VALIDATED)).toBe(false);
    });

    it('retorna false para CLOSED', () => {
        expect(isActiveStatus(IncidentStatus.CLOSED)).toBe(false);
    });

    it('retorna true para todos los estados activos', () => {
        [
            IncidentStatus.CREATED,
            IncidentStatus.DELIVERED,
            IncidentStatus.IN_PROGRESS,
            IncidentStatus.PENDING_THIRD_PARTY,
            IncidentStatus.PENDING_USER,
            IncidentStatus.PENDING_SPARE_PART,
            IncidentStatus.PENDING_PICKUP,
            IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
            IncidentStatus.REOPENED,
        ].forEach(status => {
            expect(isActiveStatus(status)).toBe(true);
        });
    });
});
