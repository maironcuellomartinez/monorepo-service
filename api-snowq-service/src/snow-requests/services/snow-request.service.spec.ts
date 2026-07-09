import { SnowRequestService } from './snow-request.service';
import { SnowRequestEntity } from '../entities/snow-request.entity';
import { RequestPriority, RequestPriorityUtils, RequestType, STATUS } from 'src/common';
import { Repository, SelectQueryBuilder, UpdateResult } from 'typeorm';

/**
 * Crea un mock completo de Repository<SnowRequestEntity>.
 */
function createMockRepo(): jest.Mocked<Repository<SnowRequestEntity>> {
    return {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        update: jest.fn(),
        createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<SnowRequestEntity>>;
}

/**
 * Crea un entity de ejemplo con valores por defecto.
 */
function buildEntity(overrides: Partial<SnowRequestEntity> = {}): SnowRequestEntity {
    return {
        id: 1,
        correlationId: 'test-correlation-id',
        internalNumber: 'SNQ-TESTXX01',
        type: RequestType.INCIDENT,
        priority: RequestPriority.MEDIUM,
        payload: { short_description: 'Test incident' },
        sysId: null,
        snowNumber: null,
        status: STATUS.QUEUED,
        source: 'test-source',
        immediate: false,
        fingerprint: null,
        expiresAt: null,
        retryCount: 0,
        maxRetries: 3,
        nextRetryAt: null,
        lastError: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as SnowRequestEntity;
}

describe('SnowRequestService', () => {
    let service: SnowRequestService;
    let repo: jest.Mocked<Repository<SnowRequestEntity>>;

    beforeEach(() => {
        repo = createMockRepo();
        service = new SnowRequestService(repo as any);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ─── create ──────────────────────────────────────────────────────────────

    describe('create()', () => {
        it('debería llamar a repo.create() y repo.save() y retornar la entidad', async () => {
            const data: Partial<SnowRequestEntity> = {
                correlationId: 'abc-123',
                internalNumber: 'SNQ-ABC123',
                type: RequestType.INCIDENT,
                status: STATUS.QUEUED,
                source: 'test',
                priority: RequestPriority.MEDIUM,
                payload: {},
                immediate: false,
                fingerprint: null,
                expiresAt: null,
            };
            const entity = buildEntity(data);

            repo.create.mockReturnValue(entity);
            repo.save.mockResolvedValue(entity);

            const result = await service.create(data);

            expect(repo.create).toHaveBeenCalledWith({
                ...data,
                maxRetries: RequestPriorityUtils.getMaxRetries(RequestPriority.MEDIUM),
            });
            expect(repo.save).toHaveBeenCalledWith(entity);
            expect(result).toBe(entity);
        });

        it('debería respetar un maxRetries explícito en vez de recalcularlo por prioridad', async () => {
            const data: Partial<SnowRequestEntity> = {
                correlationId: 'abc-123',
                internalNumber: 'SNQ-ABC123',
                type: RequestType.INCIDENT,
                status: STATUS.QUEUED,
                source: 'test',
                priority: RequestPriority.MEDIUM,
                payload: {},
                immediate: false,
                fingerprint: null,
                expiresAt: null,
                maxRetries: 3,
            };
            const entity = buildEntity(data);

            repo.create.mockReturnValue(entity);
            repo.save.mockResolvedValue(entity);

            await service.create(data);

            expect(repo.create).toHaveBeenCalledWith({ ...data, maxRetries: 3 });
        });
    });

    // ─── findByCorrelationId ──────────────────────────────────────────────────

    describe('findByCorrelationId()', () => {
        it('debería llamar a repo.findOne con el correlationId correcto', async () => {
            const entity = buildEntity();
            repo.findOne.mockResolvedValue(entity);

            const result = await service.findByCorrelationId('test-correlation-id');

            expect(repo.findOne).toHaveBeenCalledWith({ where: { correlationId: 'test-correlation-id' } });
            expect(result).toBe(entity);
        });

        it('debería retornar null si no se encuentra la entidad', async () => {
            repo.findOne.mockResolvedValue(null);

            const result = await service.findByCorrelationId('no-existe');

            expect(result).toBeNull();
        });
    });

    // ─── markAsDelivered ─────────────────────────────────────────────────────

    describe('markAsDelivered()', () => {
        it('debería llamar a repo.update con status DELIVERED, sysId y snowNumber', async () => {
            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            await service.markAsDelivered('corr-id', 'sys-id-001', 'INC001');

            expect(repo.update).toHaveBeenCalledWith(
                { correlationId: 'corr-id' },
                { status: STATUS.DELIVERED, sysId: 'sys-id-001', snowNumber: 'INC001' },
            );
        });
    });

    // ─── markAsFailed ────────────────────────────────────────────────────────

    describe('markAsFailed()', () => {
        it('debería llamar a repo.update con status FAILED y lastError truncado', async () => {
            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            await service.markAsFailed('corr-id', 'Error de prueba');

            expect(repo.update).toHaveBeenCalledWith(
                { correlationId: 'corr-id' },
                { status: STATUS.FAILED, lastError: 'Error de prueba' },
            );
        });

        it('debería llamar a repo.update con status FAILED sin lastError si no se pasa error', async () => {
            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            await service.markAsFailed('corr-id');

            expect(repo.update).toHaveBeenCalledWith(
                { correlationId: 'corr-id' },
                { status: STATUS.FAILED },
            );
        });
    });

    // ─── markAsRetry ─────────────────────────────────────────────────────────

    describe('markAsRetry()', () => {
        it('debería volver a QUEUED con backoff cuando retryCount < maxRetries', async () => {
            const entity = buildEntity({ retryCount: 0, maxRetries: 3, priority: RequestPriority.MEDIUM });
            repo.findOne.mockResolvedValue(entity);
            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            const before = Date.now();
            await service.markAsRetry('corr-id', 'timeout');
            const after = Date.now();

            expect(repo.update).toHaveBeenCalledWith(
                { correlationId: 'corr-id' },
                expect.objectContaining({
                    status: STATUS.QUEUED,
                    retryCount: 1,
                    lastError: 'timeout',
                    nextRetryAt: expect.any(Date),
                }),
            );

            const updateCall = repo.update.mock.calls[0][1] as any;
            expect(updateCall.nextRetryAt.getTime()).toBeGreaterThanOrEqual(before);
            expect(updateCall.nextRetryAt.getTime()).toBeLessThanOrEqual(after + 60000 + 100);
        });

        it('debería marcar como FAILED cuando retryCount + 1 >= maxRetries', async () => {
            const entity = buildEntity({ retryCount: 2, maxRetries: 3 });
            repo.findOne.mockResolvedValue(entity);
            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            await service.markAsRetry('corr-id', 'fatal error');

            expect(repo.update).toHaveBeenCalledWith(
                { correlationId: 'corr-id' },
                expect.objectContaining({
                    status: STATUS.FAILED,
                    retryCount: 3,
                    lastError: 'fatal error',
                }),
            );
        });

        it('debería retornar sin hacer nada si no existe la entidad', async () => {
            repo.findOne.mockResolvedValue(null);

            await service.markAsRetry('no-existe', 'error');

            expect(repo.update).not.toHaveBeenCalled();
        });

        it('debería truncar lastError a 500 caracteres', async () => {
            const entity = buildEntity({ retryCount: 0, maxRetries: 3 });
            repo.findOne.mockResolvedValue(entity);
            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            const longError = 'x'.repeat(600);
            await service.markAsRetry('corr-id', longError);

            const updateCall = repo.update.mock.calls[0][1] as any;
            expect(updateCall.lastError.length).toBe(500);
        });
    });

    // ─── findActiveByFingerprint ──────────────────────────────────────────────

    describe('findActiveByFingerprint()', () => {
        it('debería construir la query con Brackets correctamente y retornar la entidad', async () => {
            const entity = buildEntity({ fingerprint: 'fp-abc' });

            const mockQb = {
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(entity),
            } as unknown as SelectQueryBuilder<SnowRequestEntity>;

            repo.createQueryBuilder.mockReturnValue(mockQb as any);

            const result = await service.findActiveByFingerprint('fp-abc');

            expect(repo.createQueryBuilder).toHaveBeenCalledWith('r');
            expect(mockQb.where).toHaveBeenCalledWith('r.fingerprint = :fingerprint', { fingerprint: 'fp-abc' });
            expect(mockQb.orderBy).toHaveBeenCalledWith('r.createdAt', 'DESC');
            expect(result).toBe(entity);
        });

        it('debería retornar null cuando no existe un registro activo con ese fingerprint', async () => {
            const mockQb = {
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(null),
            } as unknown as SelectQueryBuilder<SnowRequestEntity>;

            repo.createQueryBuilder.mockReturnValue(mockQb as any);

            const result = await service.findActiveByFingerprint('fp-no-existe');

            expect(result).toBeNull();
        });
    });

    // ─── cancelByFingerprint ──────────────────────────────────────────────────

    describe('cancelByFingerprint()', () => {
        it('debería retornar CANCELLED cuando existe un registro QUEUED', async () => {
            const entity = buildEntity({ fingerprint: 'fp-test', status: STATUS.QUEUED });
            repo.findOne
                .mockResolvedValueOnce(entity)   // QUEUED
                .mockResolvedValue(null);        // IN_PROGRESS

            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            const result = await service.cancelByFingerprint('fp-test');

            expect(result).not.toBeNull();
            expect(result!.action).toBe('CANCELLED');
            expect(result!.entity.status).toBe(STATUS.CANCELLED);
            expect(repo.update).toHaveBeenCalledWith(
                { correlationId: entity.correlationId },
                { status: STATUS.CANCELLED },
            );
        });

        it('debería retornar TOO_LATE cuando existe un registro IN_PROGRESS', async () => {
            const inProgressEntity = buildEntity({ fingerprint: 'fp-test', status: STATUS.IN_PROGRESS });

            repo.findOne
                .mockResolvedValueOnce(null)           // QUEUED no existe
                .mockResolvedValueOnce(inProgressEntity); // IN_PROGRESS existe

            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            const result = await service.cancelByFingerprint('fp-test');

            expect(result).not.toBeNull();
            expect(result!.action).toBe('TOO_LATE');
            expect(result!.entity).toBe(inProgressEntity);
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('debería retornar RESOLVED cuando existe un registro DELIVERED con resolvedAt NULL', async () => {
            const deliveredEntity = buildEntity({
                fingerprint: 'fp-test',
                status: STATUS.DELIVERED,
                sysId: 'sys-001',
                snowNumber: 'INC001',
                resolvedAt: null,
            });

            repo.findOne
                .mockResolvedValueOnce(null)  // QUEUED no existe
                .mockResolvedValueOnce(null); // IN_PROGRESS no existe

            const mockQb = {
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(deliveredEntity),
            } as unknown as SelectQueryBuilder<SnowRequestEntity>;

            repo.createQueryBuilder.mockReturnValue(mockQb as any);
            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            const result = await service.cancelByFingerprint('fp-test');

            expect(result).not.toBeNull();
            expect(result!.action).toBe('RESOLVED');
            expect(result!.entity.resolvedAt).toBeInstanceOf(Date);
        });

        it('debería retornar null cuando no existe ningún registro activo', async () => {
            repo.findOne
                .mockResolvedValueOnce(null)  // QUEUED no existe
                .mockResolvedValueOnce(null); // IN_PROGRESS no existe

            const mockQb = {
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(null),
            } as unknown as SelectQueryBuilder<SnowRequestEntity>;

            repo.createQueryBuilder.mockReturnValue(mockQb as any);
            repo.find.mockResolvedValue([]);

            const result = await service.cancelByFingerprint('fp-no-existe');

            expect(result).toBeNull();
        });
    });

    // ─── expireOverdue ────────────────────────────────────────────────────────

    describe('expireOverdue()', () => {
        it('debería retornar el número de registros expirados (affected)', async () => {
            const mockQb = {
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 5 }),
            };

            repo.createQueryBuilder.mockReturnValue(mockQb as any);

            const count = await service.expireOverdue();

            expect(count).toBe(5);
        });

        it('debería retornar 0 si affected es undefined', async () => {
            const mockQb = {
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: undefined }),
            };

            repo.createQueryBuilder.mockReturnValue(mockQb as any);

            const count = await service.expireOverdue();

            expect(count).toBe(0);
        });
    });

    // ─── retryFailed ─────────────────────────────────────────────────────────

    describe('retryFailed()', () => {
        it('debería retornar null si el registro no existe o no está en FAILED', async () => {
            repo.findOne.mockResolvedValue(null);

            const result = await service.retryFailed('no-existe');

            expect(result).toBeNull();
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('debería resetear retryCount y volver a QUEUED si el registro está en FAILED', async () => {
            const failedEntity = buildEntity({ status: STATUS.FAILED, retryCount: 3, lastError: 'some error' });
            const requeuedEntity = buildEntity({ status: STATUS.QUEUED, retryCount: 0, lastError: null });

            repo.findOne
                .mockResolvedValueOnce(failedEntity)  // primera llamada (busca FAILED)
                .mockResolvedValueOnce(requeuedEntity); // segunda llamada (devuelve estado actualizado)

            repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

            const result = await service.retryFailed('corr-id');

            expect(repo.update).toHaveBeenCalledWith(
                { correlationId: 'corr-id' },
                { status: STATUS.QUEUED, retryCount: 0, nextRetryAt: null, lastError: null },
            );
            expect(result).toBe(requeuedEntity);
        });
    });

    // ─── retryAllFailed ──────────────────────────────────────────────────────

    describe('retryAllFailed()', () => {
        it('debería actualizar todos los FAILED a QUEUED y retornar el count afectado', async () => {
            repo.update.mockResolvedValue({ affected: 4 } as UpdateResult);

            const count = await service.retryAllFailed();

            expect(repo.update).toHaveBeenCalledWith(
                { status: STATUS.FAILED },
                { status: STATUS.QUEUED, retryCount: 0, nextRetryAt: null, lastError: null },
            );
            expect(count).toBe(4);
        });

        it('debería retornar 0 si affected es undefined', async () => {
            repo.update.mockResolvedValue({ affected: undefined } as UpdateResult);

            const count = await service.retryAllFailed();

            expect(count).toBe(0);
        });
    });
});
