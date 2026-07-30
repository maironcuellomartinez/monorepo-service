// core/domain/entities/appointment.entity.spec.ts
import { Appointment } from './appointment.entity';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { AppointmentOrigin } from '../enums/appointment-origin.enum';
import { AppointmentKind } from '../enums/appointment-kind.enum';
import { DateRange } from '../value-objects/date-range.value';
import {
    AppointmentId,
    IssueTypeId,
    CustomerId,
    CompanyId,
    CornerId,
    SlotId,
    TechnicianId,
} from '@app/shared/types/branded-ids';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function futureRange(offsetMin = 60, durationMin = 30): DateRange {
    const start = new Date(Date.now() + offsetMin * 60_000);
    const end   = new Date(start.getTime() + durationMin * 60_000);
    return DateRange.reconstitute(start, end);
}

const TECH = TechnicianId('tech-1');
const COMPANY = CompanyId('company-1');

/**
 * Crea un Appointment y lo avanza hasta el estado deseado siguiendo
 * la máquina de estados real:
 *   CREATED → DELIVERED → IN_PROGRESS → ... → CLOSED → REOPENED / VALIDATED
 */
function makeAppointment(overrides?: { status?: AppointmentStatus }): Appointment {
    const appointment = Appointment.create(
        AppointmentId('apt-1'),
        IssueTypeId('issue-1'),
        AppointmentKind.ISSUE,
        CustomerId('cust-1'),
        COMPANY,
        CornerId('corner-1'),
        [SlotId('slot-1'), SlotId('slot-2')],
        futureRange(),
        AppointmentOrigin.CUSTOMER_APP,
    ).unwrap();

    const target = overrides?.status ?? AppointmentStatus.CREATED;
    if (target === AppointmentStatus.CREATED) return appointment;

    // CREATED → DELIVERED
    appointment.deliver(TECH);
    if (target === AppointmentStatus.DELIVERED) return appointment;

    // DELIVERED → IN_PROGRESS
    appointment.changeStatus(AppointmentStatus.IN_PROGRESS, TECH);
    if (target === AppointmentStatus.IN_PROGRESS) return appointment;

    const pendingStates = [
        AppointmentStatus.PENDING_THIRD_PARTY,
        AppointmentStatus.PENDING_USER,
        AppointmentStatus.PENDING_SPARE_PART,
        AppointmentStatus.PENDING_PICKUP,
        AppointmentStatus.PENDING_REPLACEMENT_DELIVERY,
    ];
    if (pendingStates.includes(target)) {
        appointment.changeStatus(target, TECH);
        return appointment;
    }

    // → CLOSED (via PENDING_PICKUP)
    appointment.changeStatus(AppointmentStatus.PENDING_PICKUP, TECH);
    appointment.changeStatus(AppointmentStatus.CLOSED, TECH);
    if (target === AppointmentStatus.CLOSED) return appointment;

    if (target === AppointmentStatus.REOPENED) { appointment.reopen(); return appointment; }
    if (target === AppointmentStatus.VALIDATED) { appointment.validate(); return appointment; }
    if (target === AppointmentStatus.CANCELED) {
        // CANCELED solo es posible desde CREATED; empezamos de cero
        const fresh = Appointment.create(
            AppointmentId('apt-1'), IssueTypeId('issue-1'), AppointmentKind.ISSUE, CustomerId('cust-1'),
            COMPANY, CornerId('corner-1'), [SlotId('slot-1')], futureRange(), AppointmentOrigin.CUSTOMER_APP,
        ).unwrap();
        fresh.changeStatus(AppointmentStatus.CANCELED, TECH);
        return fresh;
    }

    return appointment;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Appointment.create()', () => {
    it('crea una cita en estado CREATED', () => {
        const result = Appointment.create(
            AppointmentId('apt-1'), IssueTypeId('issue-1'), AppointmentKind.ISSUE, CustomerId('cust-1'),
            COMPANY, CornerId('corner-1'), [SlotId('slot-1')], futureRange(), AppointmentOrigin.CUSTOMER_APP,
        );
        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().status).toBe(AppointmentStatus.CREATED);
    });

    it('falla si no hay slots', () => {
        const result = Appointment.create(
            AppointmentId('apt-1'), IssueTypeId('issue-1'), AppointmentKind.ISSUE, CustomerId('cust-1'),
            COMPANY, CornerId('corner-1'), [], futureRange(), AppointmentOrigin.CUSTOMER_APP,
        );
        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/slot/i);
    });

    it('falla si la duración es menor al mínimo (15 min)', () => {
        const result = Appointment.create(
            AppointmentId('apt-1'), IssueTypeId('issue-1'), AppointmentKind.ISSUE, CustomerId('cust-1'),
            COMPANY, CornerId('corner-1'), [SlotId('slot-1')], futureRange(60, 5), AppointmentOrigin.CUSTOMER_APP,
        );
        expect(result.isFailure).toBe(true);
    });

    it('emite el evento APPOINTMENT_CREATED', () => {
        const appointment = makeAppointment();
        const events = appointment.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('APPOINTMENT_CREATED');
    });

    it('pullEvents() vacía el buffer', () => {
        const appointment = makeAppointment();
        appointment.pullEvents();
        expect(appointment.pullEvents()).toHaveLength(0);
    });
});

describe('Appointment.deliver()', () => {
    it('transiciona de CREATED a DELIVERED y asigna técnico', () => {
        const appointment = makeAppointment();
        const result = appointment.deliver(TECH);

        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.DELIVERED);
        expect(appointment.currentTechnicianId?.toString()).toBe('tech-1');
    });

    it('emite el evento APPOINTMENT_DELIVERED', () => {
        const appointment = makeAppointment();
        appointment.pullEvents();
        appointment.deliver(TECH);
        const events = appointment.pullEvents();

        expect(events.find(e => e.type === 'APPOINTMENT_DELIVERED')).toBeDefined();
    });

    it('falla si la cita no está en CREATED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.DELIVERED });
        const result = appointment.deliver(TECH);
        expect(result.isFailure).toBe(true);
    });

    it('falla si la cita está CANCELED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CANCELED });
        const result = appointment.deliver(TECH);
        expect(result.isFailure).toBe(true);
    });
});

describe('Appointment.take()', () => {
    it('asigna el técnico sin cambiar el estado', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.DELIVERED });
        const tech2 = TechnicianId('tech-2');

        const result = appointment.take(tech2);

        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.DELIVERED); // estado NO cambia
        expect(appointment.currentTechnicianId?.toString()).toBe('tech-2');
    });

    it('sobreescribe el técnico anterior sin error', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        const result = appointment.take(TechnicianId('tech-2'));

        expect(result.isSuccess).toBe(true);
        expect(appointment.currentTechnicianId?.toString()).toBe('tech-2');
        expect(appointment.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('funciona desde estado PENDING_THIRD_PARTY', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.PENDING_THIRD_PARTY });
        const result = appointment.take(TechnicianId('tech-99'));
        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.PENDING_THIRD_PARTY);
    });

    it('emite APPOINTMENT_TAKEN con previousTechnicianId', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS }); // tech-1 asignado
        appointment.pullEvents();

        appointment.take(TechnicianId('tech-2'));
        const events = appointment.pullEvents();

        const taken = events.find(e => e.type === 'APPOINTMENT_TAKEN');
        expect(taken).toBeDefined();
        expect(taken!.data.previousTechnicianId?.toString()).toBe('tech-1');
    });

    it('falla si la cita está CANCELED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CANCELED });
        expect(appointment.take(TECH).isFailure).toBe(true);
    });

    it('falla si la cita está VALIDATED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.VALIDATED });
        expect(appointment.take(TECH).isFailure).toBe(true);
    });
});

describe('Appointment.reschedule()', () => {
    it('actualiza slotIds/scheduledRange/durationMinutes', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS }); // tech-1 asignado
        const newRange = futureRange(180, 45);

        const result = appointment.reschedule(TECH, [SlotId('slot-9')], newRange);

        expect(result.isSuccess).toBe(true);
        expect(appointment.slotIds.map(s => s.toString())).toEqual(['slot-9']);
        expect(appointment.scheduledRange.start.getTime()).toBe(newRange.start.getTime());
        expect(appointment.durationMinutes).toBe(45);
    });

    it('permite reprogramar desde cualquier estado no terminal (ej. PENDING_USER)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.PENDING_USER });
        const result = appointment.reschedule(TECH, [SlotId('slot-9')], futureRange(180, 30));
        expect(result.isSuccess).toBe(true);
    });

    it('falla si lo intenta un técnico distinto al asignado', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS }); // tech-1 asignado
        const result = appointment.reschedule(TechnicianId('tech-2'), [SlotId('slot-9')], futureRange(180, 30));
        expect(result.isFailure).toBe(true);
    });

    it('falla si la cita está VALIDATED (terminal)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.VALIDATED });
        const result = appointment.reschedule(TECH, [SlotId('slot-9')], futureRange(180, 30));
        expect(result.isFailure).toBe(true);
    });

    it('emite APPOINTMENT_RESCHEDULED con los slots previos y nuevos', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        appointment.pullEvents();

        appointment.reschedule(TECH, [SlotId('slot-9')], futureRange(180, 30));
        const events = appointment.pullEvents();

        const rescheduled = events.find(e => e.type === 'APPOINTMENT_RESCHEDULED');
        expect(rescheduled).toBeDefined();
        expect(rescheduled!.data.previousSlotIds.map((s: any) => s.toString())).toEqual(['slot-1', 'slot-2']);
        expect(rescheduled!.data.newSlotIds.map((s: any) => s.toString())).toEqual(['slot-9']);
    });
});

describe('Appointment.setEstimatedClose()', () => {
    it('actualiza estimatedCloseAt', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        const newClose = new Date(Date.now() + 5 * 24 * 60 * 60_000);

        const result = appointment.setEstimatedClose(TECH, newClose);

        expect(result.isSuccess).toBe(true);
        expect(appointment.estimatedCloseAt?.getTime()).toBe(newClose.getTime());
    });

    it('permite corregirlo desde cualquier estado no terminal', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.PENDING_SPARE_PART });
        const result = appointment.setEstimatedClose(TECH, new Date(Date.now() + 86_400_000));
        expect(result.isSuccess).toBe(true);
    });

    it('falla si lo intenta un técnico distinto al asignado', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        const result = appointment.setEstimatedClose(TechnicianId('tech-2'), new Date(Date.now() + 86_400_000));
        expect(result.isFailure).toBe(true);
    });

    it('falla si la cita está CLOSED (terminal)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CLOSED });
        const result = appointment.setEstimatedClose(TECH, new Date(Date.now() + 86_400_000));
        expect(result.isFailure).toBe(true);
    });

    it('falla con una fecha inválida', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        const result = appointment.setEstimatedClose(TECH, new Date('not-a-date'));
        expect(result.isFailure).toBe(true);
    });
});

describe('Appointment.changeStatus()', () => {
    it('DELIVERED → IN_PROGRESS', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.DELIVERED });
        appointment.pullEvents();

        const result = appointment.changeStatus(AppointmentStatus.IN_PROGRESS, TECH);

        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('IN_PROGRESS → PENDING_SPARE_PART', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        appointment.pullEvents();

        const result = appointment.changeStatus(AppointmentStatus.PENDING_SPARE_PART, TECH);

        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.PENDING_SPARE_PART);
    });

    it('PENDING_PICKUP → CLOSED registra closedAt', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.PENDING_PICKUP });

        appointment.changeStatus(AppointmentStatus.CLOSED, TECH);

        expect(appointment.closedAt).not.toBeNull();
        expect(appointment.status).toBe(AppointmentStatus.CLOSED);
    });

    it('PENDING_PICKUP → IN_PROGRESS (retomar trabajo)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.PENDING_PICKUP });
        const result = appointment.changeStatus(AppointmentStatus.IN_PROGRESS, TECH);
        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('PENDING_REPLACEMENT_DELIVERY → IN_PROGRESS (retomar trabajo)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.PENDING_REPLACEMENT_DELIVERY });
        const result = appointment.changeStatus(AppointmentStatus.IN_PROGRESS, TECH);
        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('DELIVERED → PENDING_SPARE_PART falla (solo puede ir a IN_PROGRESS)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.DELIVERED });
        const result = appointment.changeStatus(AppointmentStatus.PENDING_SPARE_PART, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('cualquier técnico puede cambiar estado (sin validación de asignado)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        appointment.pullEvents();

        const result = appointment.changeStatus(AppointmentStatus.PENDING_USER, TechnicianId('tech-99'));

        expect(result.isSuccess).toBe(true);
    });

    it('CREATED → IN_PROGRESS inserta automáticamente el DELIVERED intermedio', () => {
        const appointment = makeAppointment();
        appointment.pullEvents();

        const result = appointment.changeStatus(AppointmentStatus.IN_PROGRESS, TECH);

        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.IN_PROGRESS);
        expect(appointment.currentTechnicianId?.toString()).toBe('tech-1');

        const events = appointment.pullEvents();
        const delivered = events.find(e => e.type === 'APPOINTMENT_DELIVERED');
        const statusChanged = events.find(e => e.type === 'APPOINTMENT_STATUS_CHANGED');
        expect(delivered).toBeDefined();
        expect(delivered?.data.comment).toBe('Dispositivo entregado por el usuario');
        expect(statusChanged?.data.oldStatus).toBe(AppointmentStatus.DELIVERED);
        expect(statusChanged?.data.newStatus).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('sigue fallando CREATED → PENDING_USER (el atajo es solo para IN_PROGRESS)', () => {
        const appointment = makeAppointment();
        const result = appointment.changeStatus(AppointmentStatus.PENDING_USER, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('falla desde estado terminal CANCELED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CANCELED });
        const result = appointment.changeStatus(AppointmentStatus.CREATED, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('emite APPOINTMENT_STATUS_CHANGED con old y new status', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        appointment.pullEvents();

        appointment.changeStatus(AppointmentStatus.PENDING_USER, TECH, 'cliente debe confirmar');
        const events = appointment.pullEvents();

        const event = events.find(e => e.type === 'APPOINTMENT_STATUS_CHANGED');
        expect(event?.data.oldStatus).toBe(AppointmentStatus.IN_PROGRESS);
        expect(event?.data.newStatus).toBe(AppointmentStatus.PENDING_USER);
        expect(event?.data.comment).toBe('cliente debe confirmar');
    });
});

describe('Appointment.release()', () => {
    it('quita el técnico asignado sin cambiar estado', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        appointment.pullEvents();

        const result = appointment.release(TECH, 'cambio turno');

        expect(result.isSuccess).toBe(true);
        expect(appointment.currentTechnicianId).toBeNull();
        expect(appointment.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('falla si la cita está CANCELED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CANCELED });
        expect(appointment.release(TECH).isFailure).toBe(true);
    });
});

describe('Appointment.validate()', () => {
    it('transiciona de CLOSED a VALIDATED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CLOSED });
        appointment.pullEvents();

        const result = appointment.validate();

        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.VALIDATED);
    });

    it('falla si no está en CLOSED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        expect(appointment.validate().isFailure).toBe(true);
    });
});

describe('Appointment.reopen()', () => {
    it('transiciona de CLOSED a REOPENED y borra técnico', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CLOSED });
        appointment.pullEvents();

        const result = appointment.reopen('el equipo sigue fallando');

        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.REOPENED);
        expect(appointment.currentTechnicianId).toBeNull();
    });

    it('falla si la cita está CANCELED (terminal, no se reabre)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.CANCELED });
        const result = appointment.reopen('cancelada por error');
        expect(result.isFailure).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.CANCELED);
    });

    it('desde REOPENED no puede ir directo a IN_PROGRESS (debe entregar el dispositivo de nuevo)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.REOPENED });
        const result = appointment.changeStatus(AppointmentStatus.IN_PROGRESS, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('desde REOPENED puede ir a DELIVERED, CLOSED o CANCELED', () => {
        for (const target of [AppointmentStatus.DELIVERED, AppointmentStatus.CLOSED, AppointmentStatus.CANCELED]) {
            const appointment = makeAppointment({ status: AppointmentStatus.REOPENED });
            const result = appointment.changeStatus(target, TECH);
            expect(result.isSuccess).toBe(true);
        }
    });

    it('falla si no está en CLOSED', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.IN_PROGRESS });
        expect(appointment.reopen().isFailure).toBe(true);
    });

    it('una vez reabierta cualquier técnico puede tomarla (sin cambiar estado)', () => {
        const appointment = makeAppointment({ status: AppointmentStatus.REOPENED });
        const result = appointment.take(TechnicianId('tech-2'));
        expect(result.isSuccess).toBe(true);
        expect(appointment.status).toBe(AppointmentStatus.REOPENED);
    });
});

describe('Appointment.isAvailableForTaking()', () => {
    const takeableStatuses = [
        AppointmentStatus.CREATED,
        AppointmentStatus.DELIVERED,
        AppointmentStatus.IN_PROGRESS,
        AppointmentStatus.PENDING_THIRD_PARTY,
        AppointmentStatus.PENDING_USER,
        AppointmentStatus.PENDING_SPARE_PART,
        AppointmentStatus.PENDING_PICKUP,
        AppointmentStatus.PENDING_REPLACEMENT_DELIVERY,
        AppointmentStatus.CLOSED,
        AppointmentStatus.REOPENED,
    ];

    const nonTakeableStatuses = [
        AppointmentStatus.CANCELED,
        AppointmentStatus.VALIDATED,
    ];

    takeableStatuses.forEach(status => {
        it(`retorna true en estado ${status}`, () => {
            expect(makeAppointment({ status }).isAvailableForTaking()).toBe(true);
        });
    });

    nonTakeableStatuses.forEach(status => {
        it(`retorna false en estado ${status}`, () => {
            expect(makeAppointment({ status }).isAvailableForTaking()).toBe(false);
        });
    });
});
