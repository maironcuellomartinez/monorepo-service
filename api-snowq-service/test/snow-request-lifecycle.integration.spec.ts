import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';
import { SnowRequestService } from 'src/snow-requests/services/snow-request.service';
import { RequestPriority, RequestType, STATUS } from 'src/common';
import { randomUUID } from 'crypto';

/**
 * Crea un entity mínimo para persistir.
 */
function buildData(overrides: Partial<SnowRequestEntity> = {}): Partial<SnowRequestEntity> {
    const id = randomUUID().substring(0, 8).toUpperCase();
    return {
        correlationId: `test-${randomUUID()}`,
        internalNumber: `SNQ-IT-${id}`,
        type: RequestType.INCIDENT,
        priority: RequestPriority.MEDIUM,
        payload: { short_description: 'integration test incident' },
        source: 'integration-test',
        immediate: false,
        status: STATUS.QUEUED,
        fingerprint: null,
        expiresAt: null,
        retryCount: 0,
        maxRetries: 3,
        nextRetryAt: null,
        lastError: null,
        resolvedAt: null,
        ...overrides,
    };
}

describe('SnowRequestService — Integration (DB real)', () => {
    let module: TestingModule;
    let service: SnowRequestService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'mysql',
                    host: process.env.TEST_DB_HOST ?? 'localhost',
                    port: parseInt(process.env.TEST_DB_PORT ?? '3306'),
                    username: process.env.TEST_DB_USER ?? 'root',
                    password: process.env.TEST_DB_PASS ?? 'root',
                    database: process.env.TEST_DB_NAME ?? 'incidences_dbase',
                    entities: [SnowRequestEntity],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([SnowRequestEntity]),
            ],
            providers: [SnowRequestService],
        }).compile();

        service = module.get<SnowRequestService>(SnowRequestService);
    });

    afterAll(async () => {
        await module.close();
    });

    // ─── ciclo básico create → delivered ────────────────────────────────────

    it('ciclo completo: create → findByCorrelationId → markAsDelivered → verificar DELIVERED', async () => {
        const data = buildData();
        const created = await service.create(data);

        const found = await service.findByCorrelationId(created.correlationId);
        expect(found).not.toBeNull();
        expect(found!.status).toBe(STATUS.QUEUED);

        await service.markAsDelivered(created.correlationId, 'sys-int-001', 'INC-INT-001');

        const delivered = await service.findByCorrelationId(created.correlationId);
        expect(delivered!.status).toBe(STATUS.DELIVERED);
        expect(delivered!.sysId).toBe('sys-int-001');
        expect(delivered!.snowNumber).toBe('INC-INT-001');
    });

    // ─── markAsRetry — backoff ──────────────────────────────────────────────

    it('markAsRetry: retryCount=0, maxRetries=3 → status=QUEUED, retryCount=1, nextRetryAt set', async () => {
        const data = buildData({ retryCount: 0, maxRetries: 3 });
        const created = await service.create(data);

        const before = new Date();
        await service.markAsRetry(created.correlationId, 'timeout error');
        const after = new Date();

        const updated = await service.findByCorrelationId(created.correlationId);
        expect(updated!.status).toBe(STATUS.QUEUED);
        expect(updated!.retryCount).toBe(1);
        expect(updated!.lastError).toBe('timeout error');
        expect(updated!.nextRetryAt).toBeInstanceOf(Date);
        expect(updated!.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(updated!.nextRetryAt!.getTime()).toBeLessThanOrEqual(after.getTime() + 60000 + 1000);
    });

    // ─── markAsRetry hasta FAILED ───────────────────────────────────────────

    it('markAsRetry x3 (maxRetries=3) → status=FAILED', async () => {
        const data = buildData({ retryCount: 0, maxRetries: 3 });
        const created = await service.create(data);

        await service.markAsRetry(created.correlationId, 'error 1');
        await service.markAsRetry(created.correlationId, 'error 2');
        await service.markAsRetry(created.correlationId, 'error 3');

        const final = await service.findByCorrelationId(created.correlationId);
        expect(final!.status).toBe(STATUS.FAILED);
        expect(final!.retryCount).toBe(3);
    });

    // ─── expireOverdue ───────────────────────────────────────────────────────

    it('expireOverdue: registros QUEUED con expiresAt en el pasado → status=EXPIRED', async () => {
        const pastDate = new Date(Date.now() - 60000); // hace 1 minuto
        const data = buildData({ expiresAt: pastDate });
        const created = await service.create(data);

        const affected = await service.expireOverdue();
        expect(affected).toBeGreaterThanOrEqual(1);

        const expired = await service.findByCorrelationId(created.correlationId);
        expect(expired!.status).toBe(STATUS.EXPIRED);
    });

    // ─── retryFailed ─────────────────────────────────────────────────────────

    it('retryFailed: FAILED → QUEUED con retryCount=0', async () => {
        const data = buildData({ status: STATUS.FAILED, retryCount: 3, lastError: 'error previo' });
        const created = await service.create(data);

        const retried = await service.retryFailed(created.correlationId);
        expect(retried).not.toBeNull();
        expect(retried!.status).toBe(STATUS.QUEUED);
        expect(retried!.retryCount).toBe(0);
        expect(retried!.nextRetryAt).toBeNull();
        expect(retried!.lastError).toBeNull();
    });

    // ─── retryAllFailed ──────────────────────────────────────────────────────

    it('retryAllFailed: dos registros FAILED → ambos vuelven a QUEUED y retorna 2', async () => {
        const data1 = buildData({ status: STATUS.FAILED, retryCount: 2 });
        const data2 = buildData({ status: STATUS.FAILED, retryCount: 2 });

        const created1 = await service.create(data1);
        const created2 = await service.create(data2);

        const count = await service.retryAllFailed();
        expect(count).toBeGreaterThanOrEqual(2);

        const updated1 = await service.findByCorrelationId(created1.correlationId);
        const updated2 = await service.findByCorrelationId(created2.correlationId);

        expect(updated1!.status).toBe(STATUS.QUEUED);
        expect(updated2!.status).toBe(STATUS.QUEUED);
    });

    // ─── findPendingQueue — orden por tipo ───────────────────────────────────

    it('findPendingQueue: incident (400) se devuelve antes que change_request (300) y problem (200)', async () => {
        // Creamos 3 registros con distintos tipos (misma prioridad MEDIUM)
        const incidentData = buildData({ type: RequestType.INCIDENT, priority: RequestPriority.MEDIUM });
        const crData = buildData({ type: RequestType.CHANGE_REQUEST, priority: RequestPriority.MEDIUM });
        const problemData = buildData({ type: RequestType.PROBLEM, priority: RequestPriority.MEDIUM });

        // Los creamos en orden inverso para verificar que el orden no es por creación
        const problemCreated = await service.create(problemData);
        const crCreated = await service.create(crData);
        const incidentCreated = await service.create(incidentData);

        const pending = await service.findPendingQueue(10);

        // Filtramos solo los que acabamos de crear
        const ours = pending.filter(e =>
            [problemCreated.correlationId, crCreated.correlationId, incidentCreated.correlationId]
                .includes(e.correlationId),
        );

        expect(ours.length).toBe(3);

        // El primero debe ser el INCIDENT (prioridad de tipo 400)
        const types = ours.map(e => e.type);
        const incidentIndex = types.indexOf(RequestType.INCIDENT);
        const crIndex = types.indexOf(RequestType.CHANGE_REQUEST);
        const problemIndex = types.indexOf(RequestType.PROBLEM);

        expect(incidentIndex).toBeLessThan(crIndex);
        expect(crIndex).toBeLessThan(problemIndex);
    });

    // ─── cancelByFingerprint ─────────────────────────────────────────────────

    it('cancelByFingerprint: registro QUEUED con fingerprint → action=CANCELLED, status=CANCELLED en DB', async () => {
        const fp = `fp-test-${randomUUID().substring(0, 8)}`;
        const data = buildData({ fingerprint: fp, status: STATUS.QUEUED });
        const created = await service.create(data);

        const result = await service.cancelByFingerprint(fp);

        expect(result).not.toBeNull();
        expect(result!.action).toBe('CANCELLED');

        const updated = await service.findByCorrelationId(created.correlationId);
        expect(updated!.status).toBe(STATUS.CANCELLED);
    });

    it('cancelByFingerprint: registro DELIVERED sin resolvedAt → action=RESOLVED, resolvedAt set en DB', async () => {
        const fp = `fp-resolved-${randomUUID().substring(0, 8)}`;
        const data = buildData({
            fingerprint: fp,
            status: STATUS.DELIVERED,
            sysId: 'sys-resolve-001',
            snowNumber: 'INC-RESOLVE',
            resolvedAt: null,
        });
        const created = await service.create(data);

        const result = await service.cancelByFingerprint(fp);

        expect(result).not.toBeNull();
        expect(result!.action).toBe('RESOLVED');

        const updated = await service.findByCorrelationId(created.correlationId);
        expect(updated!.resolvedAt).toBeInstanceOf(Date);
    });
});
