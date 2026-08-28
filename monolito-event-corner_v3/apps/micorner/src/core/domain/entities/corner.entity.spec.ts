// core/domain/entities/corner.entity.spec.ts
import { Corner } from './corner.entity';
import { DayOfWeek } from '../enums/day-of-week.enum';
import { CornerId } from '@app/shared/types/branded-ids';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCorner(): Corner {
    return Corner.create(CornerId('corner-1'), 'Sala A', 'sala_a').unwrap();
}

const MON_SCHEDULE = { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Corner.create()', () => {
    it('crea un corner activo sin schedules', () => {
        const result = Corner.create(CornerId('c-1'), 'Sala A', 'sala_a');

        expect(result.isSuccess).toBe(true);
        const corner = result.unwrap();
        expect(corner.isActive).toBe(true);
        expect(corner.schedules).toHaveLength(0);
        expect(corner.onlyTechnicians).toBe(false);
        expect(corner.code).toBe('sala_a');
    });

    it('crea un corner exclusivo para técnicos', () => {
        const result = Corner.create(CornerId('c-1'), 'Sala Técnica', 'sala_tecnica', true);

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().onlyTechnicians).toBe(true);
        expect(result.unwrap().canUserCreateIncident()).toBe(false);
    });

    it('falla con nombre vacío', () => {
        expect(Corner.create(CornerId('c-1'), '', 'sala_a').isFailure).toBe(true);
    });

    it('falla con nombre solo espacios', () => {
        expect(Corner.create(CornerId('c-1'), '   ', 'sala_a').isFailure).toBe(true);
    });

    it('falla con code vacío', () => {
        expect(Corner.create(CornerId('c-1'), 'Sala A', '').isFailure).toBe(true);
    });

    it('falla con code en formato inválido (mayúsculas/espacios)', () => {
        expect(Corner.create(CornerId('c-1'), 'Sala A', 'Sala A').isFailure).toBe(true);
    });
});

describe('Corner.updateCode()', () => {
    it('actualiza el code con un slug válido', () => {
        const corner = makeCorner();

        const result = corner.updateCode('local_abelias');

        expect(result.isSuccess).toBe(true);
        expect(corner.code).toBe('local_abelias');
    });

    it('falla con formato inválido', () => {
        const corner = makeCorner();

        const result = corner.updateCode('Local Abelias');

        expect(result.isFailure).toBe(true);
        expect(corner.code).toBe('sala_a');
    });
});

describe('Corner.addSchedule()', () => {
    it('añade una franja horaria válida', () => {
        const corner = makeCorner();

        const result = corner.addSchedule(MON_SCHEDULE);

        expect(result.isSuccess).toBe(true);
        expect(corner.schedules).toHaveLength(1);
    });

    it('permite añadir múltiples franjas en días distintos', () => {
        const corner = makeCorner();
        corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' });
        corner.addSchedule({ dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '17:00' });

        expect(corner.schedules).toHaveLength(2);
    });

    it('falla con formato de hora inválido', () => {
        const corner = makeCorner();
        const result = corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: 'invalid', endTime: '17:00' });

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/time format/i);
    });

    it('falla si endTime <= startTime', () => {
        const corner = makeCorner();
        const result = corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '17:00', endTime: '09:00' });

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/after/i);
    });

    it('falla si endTime === startTime', () => {
        const corner = makeCorner();
        const result = corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '09:00' });

        expect(result.isFailure).toBe(true);
    });

    it('falla si ya existe la misma franja (mismo día y hora de inicio)', () => {
        const corner = makeCorner();
        corner.addSchedule(MON_SCHEDULE);

        const result = corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '18:00' });

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/already exists/i);
    });
});

describe('Corner.removeSchedule()', () => {
    it('elimina una franja existente', () => {
        const corner = makeCorner();
        corner.addSchedule(MON_SCHEDULE);

        const result = corner.removeSchedule(DayOfWeek.MONDAY, '09:00');

        expect(result.isSuccess).toBe(true);
        expect(corner.schedules).toHaveLength(0);
    });

    it('falla si la franja no existe', () => {
        const corner = makeCorner();

        const result = corner.removeSchedule(DayOfWeek.MONDAY, '09:00');

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/not found/i);
    });

    it('solo elimina la franja correcta sin afectar las demás', () => {
        const corner = makeCorner();
        corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '13:00' });
        corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '14:00', endTime: '18:00' });

        corner.removeSchedule(DayOfWeek.MONDAY, '09:00');

        expect(corner.schedules).toHaveLength(1);
        expect(corner.schedules[0].startTime).toBe('14:00');
    });
});

describe('Corner.isOpenAt()', () => {
    // 2026-03-09 es lunes. Corner.create() usa timezone 'UTC' por defecto,
    // por eso las fechas se construyen con Date.UTC() — evita que el resultado
    // dependa de la zona horaria de la máquina que corre el test.
    it('retorna true dentro del horario configurado', () => {
        const corner = makeCorner();
        corner.addSchedule(MON_SCHEDULE);

        expect(corner.isOpenAt(new Date(Date.UTC(2026, 2, 9, 10, 0, 0)))).toBe(true);
    });

    it('retorna false antes del horario de apertura', () => {
        const corner = makeCorner();
        corner.addSchedule(MON_SCHEDULE);

        expect(corner.isOpenAt(new Date(Date.UTC(2026, 2, 9, 8, 59, 0)))).toBe(false);
    });

    it('retorna false después del horario de cierre', () => {
        const corner = makeCorner();
        corner.addSchedule(MON_SCHEDULE);

        expect(corner.isOpenAt(new Date(Date.UTC(2026, 2, 9, 17, 0, 0)))).toBe(false);
    });

    it('retorna false en día sin horario', () => {
        const corner = makeCorner();
        corner.addSchedule(MON_SCHEDULE);

        // 2026-03-10 es martes
        expect(corner.isOpenAt(new Date(Date.UTC(2026, 2, 10, 10, 0, 0)))).toBe(false);
    });
});

describe('Corner.getSchedulesForDay()', () => {
    it('retorna solo las franjas del día indicado', () => {
        const corner = makeCorner();
        corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '13:00' });
        corner.addSchedule({ dayOfWeek: DayOfWeek.MONDAY, startTime: '14:00', endTime: '18:00' });
        corner.addSchedule({ dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '17:00' });

        const monSchedules = corner.getSchedulesForDay(DayOfWeek.MONDAY);

        expect(monSchedules).toHaveLength(2);
    });

    it('retorna array vacío si no hay franjas para ese día', () => {
        const corner = makeCorner();

        expect(corner.getSchedulesForDay(DayOfWeek.SUNDAY)).toHaveLength(0);
    });
});

describe('Corner.updateOperationalConfig()', () => {
    it('actualiza onlyTechnicians a true', () => {
        const corner = makeCorner();

        corner.updateOperationalConfig(true);

        expect(corner.onlyTechnicians).toBe(true);
        expect(corner.canUserCreateIncident()).toBe(false);
    });

    it('actualiza onlyTechnicians a false', () => {
        const corner = Corner.create(CornerId('c-1'), 'Sala Técnica', 'sala_tecnica', true).unwrap();

        corner.updateOperationalConfig(false);

        expect(corner.onlyTechnicians).toBe(false);
    });
});

describe('Corner activate/deactivate', () => {
    it('deactivate() marca el corner como inactivo', () => {
        const corner = makeCorner();

        corner.deactivate();

        expect(corner.isActive).toBe(false);
    });

    it('activate() reactiva el corner', () => {
        const corner = makeCorner();
        corner.deactivate();

        corner.activate();

        expect(corner.isActive).toBe(true);
    });
});

describe('Corner.clearSchedules()', () => {
    it('elimina todos los horarios', () => {
        const corner = makeCorner();
        corner.addSchedule(MON_SCHEDULE);
        corner.addSchedule({ dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '17:00' });

        corner.clearSchedules();

        expect(corner.schedules).toHaveLength(0);
    });
});

describe('Corner.canUserCreateIncident()', () => {
    it('retorna true si no es exclusivo de técnicos', () => {
        const corner = makeCorner();
        expect(corner.canUserCreateIncident()).toBe(true);
    });

    it('retorna false si es exclusivo de técnicos', () => {
        const corner = Corner.create(CornerId('c-1'), 'Sala Técnica', 'sala_tecnica', true).unwrap();
        expect(corner.canUserCreateIncident()).toBe(false);
    });
});
