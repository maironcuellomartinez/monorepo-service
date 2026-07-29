// core/domain/enums/appointment-status.enum.spec.ts
import {
    AppointmentStatus,
    canTransitionTo,
} from './appointment-status.enum';

describe('canTransitionTo()', () => {
    // ── Transiciones válidas ──────────────────────────────────────────────────
    const validTransitions: [AppointmentStatus, AppointmentStatus][] = [
        // Inicio del flujo
        [AppointmentStatus.CREATED,   AppointmentStatus.DELIVERED],
        [AppointmentStatus.CREATED,   AppointmentStatus.CANCELED],
        // Desde DELIVERED
        [AppointmentStatus.DELIVERED, AppointmentStatus.IN_PROGRESS],
        [AppointmentStatus.DELIVERED, AppointmentStatus.CLOSED],
        // Desde IN_PROGRESS
        [AppointmentStatus.IN_PROGRESS, AppointmentStatus.PENDING_THIRD_PARTY],
        [AppointmentStatus.IN_PROGRESS, AppointmentStatus.PENDING_USER],
        [AppointmentStatus.IN_PROGRESS, AppointmentStatus.PENDING_SPARE_PART],
        [AppointmentStatus.IN_PROGRESS, AppointmentStatus.PENDING_PICKUP],
        [AppointmentStatus.IN_PROGRESS, AppointmentStatus.PENDING_REPLACEMENT_DELIVERY],
        [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CLOSED],
        // Vuelta a IN_PROGRESS desde pendientes, o cierre directo desde cualquiera
        [AppointmentStatus.PENDING_THIRD_PARTY, AppointmentStatus.IN_PROGRESS],
        [AppointmentStatus.PENDING_THIRD_PARTY, AppointmentStatus.CLOSED],
        [AppointmentStatus.PENDING_USER,        AppointmentStatus.IN_PROGRESS],
        [AppointmentStatus.PENDING_USER,        AppointmentStatus.CLOSED],
        [AppointmentStatus.PENDING_SPARE_PART,  AppointmentStatus.IN_PROGRESS],
        [AppointmentStatus.PENDING_SPARE_PART,  AppointmentStatus.CLOSED],
        // Pre-cierre ↔ cierre / vuelta a trabajar
        [AppointmentStatus.PENDING_PICKUP,               AppointmentStatus.IN_PROGRESS],
        [AppointmentStatus.PENDING_PICKUP,               AppointmentStatus.CLOSED],
        [AppointmentStatus.PENDING_REPLACEMENT_DELIVERY, AppointmentStatus.IN_PROGRESS],
        [AppointmentStatus.PENDING_REPLACEMENT_DELIVERY, AppointmentStatus.CLOSED],
        // Reapertura — REOPENED es un nuevo slot, el cliente debe entregar el
        // dispositivo de nuevo (igual que CREATED).
        [AppointmentStatus.REOPENED, AppointmentStatus.DELIVERED],
        [AppointmentStatus.REOPENED, AppointmentStatus.CLOSED],
        [AppointmentStatus.REOPENED, AppointmentStatus.CANCELED],
    ];

    validTransitions.forEach(([from, to]) => {
        it(`${from} → ${to} es válida`, () => {
            expect(canTransitionTo(from, to)).toBe(true);
        });
    });

    // ── Transiciones inválidas ────────────────────────────────────────────────
    const invalidTransitions: [AppointmentStatus, AppointmentStatus][] = [
        [AppointmentStatus.CREATED,   AppointmentStatus.IN_PROGRESS],   // debe pasar por DELIVERED
        [AppointmentStatus.CREATED,   AppointmentStatus.CLOSED],
        [AppointmentStatus.CREATED,   AppointmentStatus.VALIDATED],
        // DELIVERED no salta directo a un pendiente — primero debe pasar por IN_PROGRESS
        [AppointmentStatus.DELIVERED, AppointmentStatus.PENDING_THIRD_PARTY],
        [AppointmentStatus.DELIVERED, AppointmentStatus.PENDING_USER],
        [AppointmentStatus.DELIVERED, AppointmentStatus.PENDING_SPARE_PART],
        [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELED],
        [AppointmentStatus.CLOSED, AppointmentStatus.IN_PROGRESS],       // debe reabrir primero
        [AppointmentStatus.CANCELED, AppointmentStatus.CREATED],
        [AppointmentStatus.VALIDATED, AppointmentStatus.REOPENED],
        [AppointmentStatus.REOPENED, AppointmentStatus.IN_PROGRESS],   // debe pasar por DELIVERED de nuevo
    ];

    invalidTransitions.forEach(([from, to]) => {
        it(`${from} → ${to} es inválida`, () => {
            expect(canTransitionTo(from, to)).toBe(false);
        });
    });

    it('CANCELED no permite ninguna transición', () => {
        Object.values(AppointmentStatus).forEach(to => {
            expect(canTransitionTo(AppointmentStatus.CANCELED, to)).toBe(false);
        });
    });

    it('VALIDATED no permite ninguna transición', () => {
        Object.values(AppointmentStatus).forEach(to => {
            expect(canTransitionTo(AppointmentStatus.VALIDATED, to)).toBe(false);
        });
    });

    it('CLOSED no permite transiciones via changeStatus (solo por reopen/validate)', () => {
        Object.values(AppointmentStatus).forEach(to => {
            expect(canTransitionTo(AppointmentStatus.CLOSED, to)).toBe(false);
        });
    });
});

