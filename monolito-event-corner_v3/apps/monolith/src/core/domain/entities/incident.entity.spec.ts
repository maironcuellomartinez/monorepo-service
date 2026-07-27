// core/domain/entities/incident.entity.spec.ts
import { Incident } from './incident.entity';
import { IncidentStatus } from '../enums/incident-status.enum';
import { IncidentOrigin } from '../enums/incident-origin.enum';
import { DateRange } from '../value-objects/date-range.value';
import {
    IncidentId,
    IssueTypeId,
    CustomerId,
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

/**
 * Crea un Incident y lo avanza hasta el estado deseado siguiendo
 * la máquina de estados real:
 *   CREATED → DELIVERED → IN_PROGRESS → ... → CLOSED → REOPENED / VALIDATED
 */
function makeIncident(overrides?: { status?: IncidentStatus }): Incident {
    const incident = Incident.create(
        IncidentId('inc-1'),
        IssueTypeId('issue-1'),
        CustomerId('cust-1'),
        CornerId('corner-1'),
        [SlotId('slot-1'), SlotId('slot-2')],
        futureRange(),
        IncidentOrigin.CUSTOMER_APP,
    ).unwrap();

    const target = overrides?.status ?? IncidentStatus.CREATED;
    if (target === IncidentStatus.CREATED) return incident;

    // CREATED → DELIVERED
    incident.deliver(TECH);
    if (target === IncidentStatus.DELIVERED) return incident;

    // DELIVERED → IN_PROGRESS
    incident.changeStatus(IncidentStatus.IN_PROGRESS, TECH);
    if (target === IncidentStatus.IN_PROGRESS) return incident;

    const pendingStates = [
        IncidentStatus.PENDING_THIRD_PARTY,
        IncidentStatus.PENDING_USER,
        IncidentStatus.PENDING_SPARE_PART,
        IncidentStatus.PENDING_PICKUP,
        IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
    ];
    if (pendingStates.includes(target)) {
        incident.changeStatus(target, TECH);
        return incident;
    }

    // → CLOSED (via PENDING_PICKUP)
    incident.changeStatus(IncidentStatus.PENDING_PICKUP, TECH);
    incident.changeStatus(IncidentStatus.CLOSED, TECH);
    if (target === IncidentStatus.CLOSED) return incident;

    if (target === IncidentStatus.REOPENED) { incident.reopen(); return incident; }
    if (target === IncidentStatus.VALIDATED) { incident.validate(); return incident; }
    if (target === IncidentStatus.CANCELED) {
        // CANCELED solo es posible desde CREATED; empezamos de cero
        const fresh = Incident.create(
            IncidentId('inc-1'), IssueTypeId('issue-1'), CustomerId('cust-1'),
            CornerId('corner-1'), [SlotId('slot-1')], futureRange(), IncidentOrigin.CUSTOMER_APP,
        ).unwrap();
        fresh.changeStatus(IncidentStatus.CANCELED, TECH);
        return fresh;
    }

    return incident;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Incident.create()', () => {
    it('crea una incidencia en estado CREATED', () => {
        const result = Incident.create(
            IncidentId('inc-1'), IssueTypeId('issue-1'), CustomerId('cust-1'),
            CornerId('corner-1'), [SlotId('slot-1')], futureRange(), IncidentOrigin.CUSTOMER_APP,
        );
        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().status).toBe(IncidentStatus.CREATED);
    });

    it('falla si no hay slots', () => {
        const result = Incident.create(
            IncidentId('inc-1'), IssueTypeId('issue-1'), CustomerId('cust-1'),
            CornerId('corner-1'), [], futureRange(), IncidentOrigin.CUSTOMER_APP,
        );
        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/slot/i);
    });

    it('falla si la duración es menor al mínimo (15 min)', () => {
        const result = Incident.create(
            IncidentId('inc-1'), IssueTypeId('issue-1'), CustomerId('cust-1'),
            CornerId('corner-1'), [SlotId('slot-1')], futureRange(60, 5), IncidentOrigin.CUSTOMER_APP,
        );
        expect(result.isFailure).toBe(true);
    });

    it('emite el evento INCIDENT_CREATED', () => {
        const incident = makeIncident();
        const events = incident.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('INCIDENT_CREATED');
    });

    it('pullEvents() vacía el buffer', () => {
        const incident = makeIncident();
        incident.pullEvents();
        expect(incident.pullEvents()).toHaveLength(0);
    });
});

describe('Incident.deliver()', () => {
    it('transiciona de CREATED a DELIVERED y asigna técnico', () => {
        const incident = makeIncident();
        const result = incident.deliver(TECH);

        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.DELIVERED);
        expect(incident.currentTechnicianId?.toString()).toBe('tech-1');
    });

    it('emite el evento INCIDENT_DELIVERED', () => {
        const incident = makeIncident();
        incident.pullEvents();
        incident.deliver(TECH);
        const events = incident.pullEvents();

        expect(events.find(e => e.type === 'INCIDENT_DELIVERED')).toBeDefined();
    });

    it('falla si la incidencia no está en CREATED', () => {
        const incident = makeIncident({ status: IncidentStatus.DELIVERED });
        const result = incident.deliver(TECH);
        expect(result.isFailure).toBe(true);
    });

    it('falla si la incidencia está CANCELED', () => {
        const incident = makeIncident({ status: IncidentStatus.CANCELED });
        const result = incident.deliver(TECH);
        expect(result.isFailure).toBe(true);
    });
});

describe('Incident.take()', () => {
    it('asigna el técnico sin cambiar el estado', () => {
        const incident = makeIncident({ status: IncidentStatus.DELIVERED });
        const tech2 = TechnicianId('tech-2');

        const result = incident.take(tech2);

        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.DELIVERED); // estado NO cambia
        expect(incident.currentTechnicianId?.toString()).toBe('tech-2');
    });

    it('sobreescribe el técnico anterior sin error', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        const result = incident.take(TechnicianId('tech-2'));

        expect(result.isSuccess).toBe(true);
        expect(incident.currentTechnicianId?.toString()).toBe('tech-2');
        expect(incident.status).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('funciona desde estado PENDING_THIRD_PARTY', () => {
        const incident = makeIncident({ status: IncidentStatus.PENDING_THIRD_PARTY });
        const result = incident.take(TechnicianId('tech-99'));
        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.PENDING_THIRD_PARTY);
    });

    it('emite INCIDENT_TAKEN con previousTechnicianId', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS }); // tech-1 asignado
        incident.pullEvents();

        incident.take(TechnicianId('tech-2'));
        const events = incident.pullEvents();

        const taken = events.find(e => e.type === 'INCIDENT_TAKEN');
        expect(taken).toBeDefined();
        expect(taken!.data.previousTechnicianId?.toString()).toBe('tech-1');
    });

    it('falla si la incidencia está CANCELED', () => {
        const incident = makeIncident({ status: IncidentStatus.CANCELED });
        expect(incident.take(TECH).isFailure).toBe(true);
    });

    it('falla si la incidencia está VALIDATED', () => {
        const incident = makeIncident({ status: IncidentStatus.VALIDATED });
        expect(incident.take(TECH).isFailure).toBe(true);
    });
});

describe('Incident.reschedule()', () => {
    it('actualiza slotIds/scheduledRange/durationMinutes', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS }); // tech-1 asignado
        const newRange = futureRange(180, 45);

        const result = incident.reschedule(TECH, [SlotId('slot-9')], newRange);

        expect(result.isSuccess).toBe(true);
        expect(incident.slotIds.map(s => s.toString())).toEqual(['slot-9']);
        expect(incident.scheduledRange.start.getTime()).toBe(newRange.start.getTime());
        expect(incident.durationMinutes).toBe(45);
    });

    it('permite reprogramar desde cualquier estado no terminal (ej. PENDING_USER)', () => {
        const incident = makeIncident({ status: IncidentStatus.PENDING_USER });
        const result = incident.reschedule(TECH, [SlotId('slot-9')], futureRange(180, 30));
        expect(result.isSuccess).toBe(true);
    });

    it('falla si lo intenta un técnico distinto al asignado', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS }); // tech-1 asignado
        const result = incident.reschedule(TechnicianId('tech-2'), [SlotId('slot-9')], futureRange(180, 30));
        expect(result.isFailure).toBe(true);
    });

    it('falla si la incidencia está VALIDATED (terminal)', () => {
        const incident = makeIncident({ status: IncidentStatus.VALIDATED });
        const result = incident.reschedule(TECH, [SlotId('slot-9')], futureRange(180, 30));
        expect(result.isFailure).toBe(true);
    });

    it('emite INCIDENT_RESCHEDULED con los slots previos y nuevos', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        incident.pullEvents();

        incident.reschedule(TECH, [SlotId('slot-9')], futureRange(180, 30));
        const events = incident.pullEvents();

        const rescheduled = events.find(e => e.type === 'INCIDENT_RESCHEDULED');
        expect(rescheduled).toBeDefined();
        expect(rescheduled!.data.previousSlotIds.map((s: any) => s.toString())).toEqual(['slot-1', 'slot-2']);
        expect(rescheduled!.data.newSlotIds.map((s: any) => s.toString())).toEqual(['slot-9']);
    });
});

describe('Incident.setEstimatedClose()', () => {
    it('actualiza estimatedCloseAt', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        const newClose = new Date(Date.now() + 5 * 24 * 60 * 60_000);

        const result = incident.setEstimatedClose(TECH, newClose);

        expect(result.isSuccess).toBe(true);
        expect(incident.estimatedCloseAt?.getTime()).toBe(newClose.getTime());
    });

    it('permite corregirlo desde cualquier estado no terminal', () => {
        const incident = makeIncident({ status: IncidentStatus.PENDING_SPARE_PART });
        const result = incident.setEstimatedClose(TECH, new Date(Date.now() + 86_400_000));
        expect(result.isSuccess).toBe(true);
    });

    it('falla si lo intenta un técnico distinto al asignado', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        const result = incident.setEstimatedClose(TechnicianId('tech-2'), new Date(Date.now() + 86_400_000));
        expect(result.isFailure).toBe(true);
    });

    it('falla si la incidencia está CLOSED (terminal)', () => {
        const incident = makeIncident({ status: IncidentStatus.CLOSED });
        const result = incident.setEstimatedClose(TECH, new Date(Date.now() + 86_400_000));
        expect(result.isFailure).toBe(true);
    });

    it('falla con una fecha inválida', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        const result = incident.setEstimatedClose(TECH, new Date('not-a-date'));
        expect(result.isFailure).toBe(true);
    });
});

describe('Incident.changeStatus()', () => {
    it('DELIVERED → IN_PROGRESS', () => {
        const incident = makeIncident({ status: IncidentStatus.DELIVERED });
        incident.pullEvents();

        const result = incident.changeStatus(IncidentStatus.IN_PROGRESS, TECH);

        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('IN_PROGRESS → PENDING_SPARE_PART', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        incident.pullEvents();

        const result = incident.changeStatus(IncidentStatus.PENDING_SPARE_PART, TECH);

        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.PENDING_SPARE_PART);
    });

    it('PENDING_PICKUP → CLOSED registra closedAt', () => {
        const incident = makeIncident({ status: IncidentStatus.PENDING_PICKUP });

        incident.changeStatus(IncidentStatus.CLOSED, TECH);

        expect(incident.closedAt).not.toBeNull();
        expect(incident.status).toBe(IncidentStatus.CLOSED);
    });

    it('PENDING_PICKUP → IN_PROGRESS (retomar trabajo)', () => {
        const incident = makeIncident({ status: IncidentStatus.PENDING_PICKUP });
        const result = incident.changeStatus(IncidentStatus.IN_PROGRESS, TECH);
        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('PENDING_REPLACEMENT_DELIVERY → IN_PROGRESS (retomar trabajo)', () => {
        const incident = makeIncident({ status: IncidentStatus.PENDING_REPLACEMENT_DELIVERY });
        const result = incident.changeStatus(IncidentStatus.IN_PROGRESS, TECH);
        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('DELIVERED → PENDING_SPARE_PART falla (solo puede ir a IN_PROGRESS)', () => {
        const incident = makeIncident({ status: IncidentStatus.DELIVERED });
        const result = incident.changeStatus(IncidentStatus.PENDING_SPARE_PART, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('cualquier técnico puede cambiar estado (sin validación de asignado)', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        incident.pullEvents();

        const result = incident.changeStatus(IncidentStatus.PENDING_USER, TechnicianId('tech-99'));

        expect(result.isSuccess).toBe(true);
    });

    it('falla con transición inválida (CREATED → IN_PROGRESS sin pasar por DELIVERED)', () => {
        const incident = makeIncident();
        const result = incident.changeStatus(IncidentStatus.IN_PROGRESS, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('falla desde estado terminal CANCELED', () => {
        const incident = makeIncident({ status: IncidentStatus.CANCELED });
        const result = incident.changeStatus(IncidentStatus.CREATED, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('emite INCIDENT_STATUS_CHANGED con old y new status', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        incident.pullEvents();

        incident.changeStatus(IncidentStatus.PENDING_USER, TECH, 'cliente debe confirmar');
        const events = incident.pullEvents();

        const event = events.find(e => e.type === 'INCIDENT_STATUS_CHANGED');
        expect(event?.data.oldStatus).toBe(IncidentStatus.IN_PROGRESS);
        expect(event?.data.newStatus).toBe(IncidentStatus.PENDING_USER);
        expect(event?.data.comment).toBe('cliente debe confirmar');
    });
});

describe('Incident.release()', () => {
    it('quita el técnico asignado sin cambiar estado', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        incident.pullEvents();

        const result = incident.release(TECH, 'cambio turno');

        expect(result.isSuccess).toBe(true);
        expect(incident.currentTechnicianId).toBeNull();
        expect(incident.status).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('falla si la incidencia está CANCELED', () => {
        const incident = makeIncident({ status: IncidentStatus.CANCELED });
        expect(incident.release(TECH).isFailure).toBe(true);
    });
});

describe('Incident.validate()', () => {
    it('transiciona de CLOSED a VALIDATED', () => {
        const incident = makeIncident({ status: IncidentStatus.CLOSED });
        incident.pullEvents();

        const result = incident.validate();

        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.VALIDATED);
    });

    it('falla si no está en CLOSED', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        expect(incident.validate().isFailure).toBe(true);
    });
});

describe('Incident.reopen()', () => {
    it('transiciona de CLOSED a REOPENED y borra técnico', () => {
        const incident = makeIncident({ status: IncidentStatus.CLOSED });
        incident.pullEvents();

        const result = incident.reopen('el equipo sigue fallando');

        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.REOPENED);
        expect(incident.currentTechnicianId).toBeNull();
    });

    it('transiciona de CANCELED a REOPENED (recuperar cancelada por error)', () => {
        const incident = makeIncident({ status: IncidentStatus.CANCELED });
        const result = incident.reopen('cancelada por error');
        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.REOPENED);
        expect(incident.currentTechnicianId).toBeNull();
    });

    it('desde REOPENED no puede ir directo a IN_PROGRESS (debe entregar el dispositivo de nuevo)', () => {
        const incident = makeIncident({ status: IncidentStatus.REOPENED });
        const result = incident.changeStatus(IncidentStatus.IN_PROGRESS, TECH);
        expect(result.isFailure).toBe(true);
    });

    it('desde REOPENED puede ir a DELIVERED, CLOSED o CANCELED', () => {
        for (const target of [IncidentStatus.DELIVERED, IncidentStatus.CLOSED, IncidentStatus.CANCELED]) {
            const incident = makeIncident({ status: IncidentStatus.REOPENED });
            const result = incident.changeStatus(target, TECH);
            expect(result.isSuccess).toBe(true);
        }
    });

    it('falla si no está en CLOSED ni CANCELED', () => {
        const incident = makeIncident({ status: IncidentStatus.IN_PROGRESS });
        expect(incident.reopen().isFailure).toBe(true);
    });

    it('una vez reabierta cualquier técnico puede tomarla (sin cambiar estado)', () => {
        const incident = makeIncident({ status: IncidentStatus.REOPENED });
        const result = incident.take(TechnicianId('tech-2'));
        expect(result.isSuccess).toBe(true);
        expect(incident.status).toBe(IncidentStatus.REOPENED);
    });
});

describe('Incident.isAvailableForTaking()', () => {
    const takeableStatuses = [
        IncidentStatus.CREATED,
        IncidentStatus.DELIVERED,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.PENDING_THIRD_PARTY,
        IncidentStatus.PENDING_USER,
        IncidentStatus.PENDING_SPARE_PART,
        IncidentStatus.PENDING_PICKUP,
        IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
        IncidentStatus.CLOSED,
        IncidentStatus.REOPENED,
    ];

    const nonTakeableStatuses = [
        IncidentStatus.CANCELED,
        IncidentStatus.VALIDATED,
    ];

    takeableStatuses.forEach(status => {
        it(`retorna true en estado ${status}`, () => {
            expect(makeIncident({ status }).isAvailableForTaking()).toBe(true);
        });
    });

    nonTakeableStatuses.forEach(status => {
        it(`retorna false en estado ${status}`, () => {
            expect(makeIncident({ status }).isAvailableForTaking()).toBe(false);
        });
    });
});
