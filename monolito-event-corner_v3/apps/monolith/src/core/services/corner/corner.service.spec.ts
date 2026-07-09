// core/services/corner/corner.service.spec.ts
import { CornerService } from './corner.service';
import { Corner } from '../../domain/entities/corner.entity';
import { DayOfWeek } from '../../domain/enums/day-of-week.enum';
import { Result } from '@app/result';
import { CornerId } from '@app/shared/types/branded-ids';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCorner(): Corner {
    return Corner.create(CornerId('corner-1'), 'Sala A').unwrap();
}

function buildMocks(opts?: {
    corner?: Corner | null;
    saveFails?: boolean;
    updateFails?: boolean;
}) {
    const corner = opts?.corner !== undefined ? opts.corner : makeCorner();

    const cornerRepo = {
        findById: jest.fn().mockResolvedValue(Result.ok(corner)),
        save: jest.fn().mockResolvedValue(
            opts?.saveFails ? Result.err(new Error('DB error')) : Result.ok(undefined),
        ),
        update: jest.fn().mockResolvedValue(
            opts?.updateFails ? Result.err(new Error('DB error')) : Result.ok(undefined),
        ),
        findAllActive: jest.fn().mockResolvedValue(Result.ok([])),
    };

    const scheduleRepo = {
        findById: jest.fn().mockResolvedValue(Result.ok({ id: 'sched-1', cornerId: 'corner-1' })),
        delete: jest.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const eventBus = {
        publish: jest.fn().mockResolvedValue(undefined),
        publishMany: jest.fn().mockResolvedValue(undefined),
    };

    const tracing = { run: jest.fn().mockImplementation((_name: any, _opts: any, fn: any) => fn()) };

    const service = new CornerService(
        cornerRepo as any,
        scheduleRepo as any,
        eventBus as any,
        tracing as any,
    );

    return { service, cornerRepo, scheduleRepo, eventBus, tracing };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CornerService.createCorner()', () => {
    it('crea un corner, lo guarda y publica CORNER_CREATED', async () => {
        const { service, cornerRepo, eventBus } = buildMocks();

        const result = await service.createCorner({ name: 'Sala A' });

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().name).toBe('Sala A');
        expect(cornerRepo.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'CORNER_CREATED' }),
        );
    });

    it('falla si el nombre está vacío', async () => {
        const { service } = buildMocks();

        const result = await service.createCorner({ name: '' });

        expect(result.isFailure).toBe(true);
    });

    it('falla si el repositorio falla al guardar', async () => {
        const { service } = buildMocks({ saveFails: true });

        const result = await service.createCorner({ name: 'Sala A' });

        expect(result.isFailure).toBe(true);
    });

    it('no publica evento si el guardado falla', async () => {
        const { service, eventBus } = buildMocks({ saveFails: true });

        await service.createCorner({ name: 'Sala A' });

        expect(eventBus.publish).not.toHaveBeenCalled();
    });
});

describe('CornerService.updateCorner()', () => {
    it('actualiza el nombre del corner', async () => {
        const { service, cornerRepo } = buildMocks();

        const result = await service.updateCorner('corner-1', { name: 'Sala B' });

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().name).toBe('Sala B');
        expect(cornerRepo.update).toHaveBeenCalledTimes(1);
    });

    it('activa el corner si isActive = true', async () => {
        const corner = makeCorner();
        corner.deactivate();
        const { service, cornerRepo } = buildMocks({ corner });
        cornerRepo.findById.mockResolvedValue(Result.ok(corner));

        const result = await service.updateCorner('corner-1', { isActive: true });

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().isActive).toBe(true);
    });

    it('desactiva el corner si isActive = false', async () => {
        const { service } = buildMocks();

        const result = await service.updateCorner('corner-1', { isActive: false });

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap().isActive).toBe(false);
    });

    it('falla si el corner no existe', async () => {
        const { service, cornerRepo } = buildMocks({ corner: null });
        cornerRepo.findById.mockResolvedValue(Result.ok(null));

        const result = await service.updateCorner('corner-x', { name: 'X' });

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/not found/i);
    });

    it('falla si el repositorio falla al actualizar', async () => {
        const { service } = buildMocks({ updateFails: true });

        const result = await service.updateCorner('corner-1', { name: 'Sala B' });

        expect(result.isFailure).toBe(true);
    });
});

describe('CornerService.getCorner()', () => {
    it('retorna el corner si existe', async () => {
        const { service, cornerRepo } = buildMocks();

        const result = await service.getCorner('corner-1');

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap()?.name).toBe('Sala A');
        expect(cornerRepo.findById).toHaveBeenCalledWith(CornerId('corner-1'));
    });

    it('retorna null si el corner no existe', async () => {
        const { service, cornerRepo } = buildMocks();
        cornerRepo.findById.mockResolvedValue(Result.ok(null));

        const result = await service.getCorner('corner-x');

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap()).toBeNull();
    });
});

describe('CornerService.getAllActiveCorners()', () => {
    it('delega al repositorio', async () => {
        const corners = [makeCorner(), makeCorner()];
        const { service, cornerRepo } = buildMocks();
        cornerRepo.findAllActive.mockResolvedValue(Result.ok(corners));

        const result = await service.getAllActiveCorners();

        expect(result.isSuccess).toBe(true);
        expect(result.unwrap()).toHaveLength(2);
        expect(cornerRepo.findAllActive).toHaveBeenCalledTimes(1);
    });
});

describe('CornerService.addSchedule()', () => {
    it('añade una franja horaria y actualiza el corner', async () => {
        const { service, cornerRepo } = buildMocks();

        const result = await service.addSchedule({
            cornerId: 'corner-1',
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '09:00',
            endTime: '17:00',
        });

        expect(result.isSuccess).toBe(true);
        expect(cornerRepo.update).toHaveBeenCalledTimes(1);
    });

    it('falla si el corner no existe', async () => {
        const { service, cornerRepo } = buildMocks();
        cornerRepo.findById.mockResolvedValue(Result.ok(null));

        const result = await service.addSchedule({
            cornerId: 'corner-x',
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '09:00',
            endTime: '17:00',
        });

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/not found/i);
    });
});

describe('CornerService.removeSchedule()', () => {
    it('elimina un schedule existente', async () => {
        const { service, scheduleRepo } = buildMocks();

        const result = await service.removeSchedule('sched-1');

        expect(result.isSuccess).toBe(true);
        expect(scheduleRepo.delete).toHaveBeenCalledWith('sched-1');
    });

    it('falla si el schedule no existe', async () => {
        const { service, scheduleRepo } = buildMocks();
        scheduleRepo.findById.mockResolvedValue(Result.ok(null));

        const result = await service.removeSchedule('sched-x');

        expect(result.isFailure).toBe(true);
        expect(result.unwrapError().message).toMatch(/not found/i);
    });
});
