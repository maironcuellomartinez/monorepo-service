import { MonitoringService } from './monitoring.service';
import { SnowRequestService } from 'src/snow-requests/services/snow-request.service';
import { ServiceNowClientService } from 'src/servicenow/client/servicenow-client.service';
import { NagiosNotificationType, NagiosStateType, ThrukAlertDto } from './dto/thruk-alert.dto';
import { RequestType, STATUS, CorrelationIdService } from 'src/common';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';

function buildAlert(overrides: Partial<ThrukAlertDto> = {}): ThrukAlertDto {
    return {
        notificationType: NagiosNotificationType.PROBLEM,
        host: 'web-server-01',
        service: 'HTTP',
        state: 'CRITICAL',
        stateType: NagiosStateType.HARD,
        checkAttempt: 3,
        maxCheckAttempts: 3,
        output: 'HTTP CRITICAL - Connection refused',
        ...overrides,
    } as ThrukAlertDto;
}

function buildEntity(overrides: Partial<SnowRequestEntity> = {}): SnowRequestEntity {
    return {
        id: 1,
        correlationId: 'mon-correlation-id',
        internalNumber: 'MON-ABCD1234',
        type: RequestType.INCIDENT,
        priority: 4,
        payload: {},
        sysId: 'sys-sn-001',
        snowNumber: 'INC0001',
        status: STATUS.QUEUED,
        source: 'nagios-thruk',
        immediate: false,
        fingerprint: 'some-fingerprint',
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

describe('MonitoringService', () => {
    let service: MonitoringService;
    let snowRequestService: jest.Mocked<SnowRequestService>;
    let snowClient: jest.Mocked<ServiceNowClientService>;

    beforeEach(() => {
        snowRequestService = {
            create: jest.fn(),
            findActiveByFingerprint: jest.fn(),
            cancelByFingerprint: jest.fn(),
            find: jest.fn(),
        } as unknown as jest.Mocked<SnowRequestService>;

        snowClient = {
            patchToServiceNow: jest.fn(),
        } as unknown as jest.Mocked<ServiceNowClientService>;

        const correlationIdService = new CorrelationIdService();

        service = new MonitoringService(snowRequestService, snowClient, correlationIdService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ─── Notificaciones ignoradas ────────────────────────────────────────────

    describe('handleAlert() — notificaciones ignoradas', () => {
        it('debería ignorar ACKNOWLEDGEMENT', async () => {
            const dto = buildAlert({ notificationType: NagiosNotificationType.ACKNOWLEDGEMENT });

            const result = await service.handleAlert(dto);

            expect(result.action).toBe('IGNORED');
            expect(snowRequestService.create).not.toHaveBeenCalled();
        });

        it('debería ignorar FLAPPINGSTART', async () => {
            const dto = buildAlert({ notificationType: NagiosNotificationType.FLAPPINGSTART });

            const result = await service.handleAlert(dto);

            expect(result.action).toBe('IGNORED');
        });

        it('debería ignorar FLAPPINGSTOP', async () => {
            const dto = buildAlert({ notificationType: NagiosNotificationType.FLAPPINGSTOP });

            const result = await service.handleAlert(dto);

            expect(result.action).toBe('IGNORED');
        });

        it('debería ignorar DOWNTIMESTART', async () => {
            const dto = buildAlert({ notificationType: NagiosNotificationType.DOWNTIMESTART });

            const result = await service.handleAlert(dto);

            expect(result.action).toBe('IGNORED');
        });

        it('debería ignorar DOWNTIMEEND', async () => {
            const dto = buildAlert({ notificationType: NagiosNotificationType.DOWNTIMEEND });

            const result = await service.handleAlert(dto);

            expect(result.action).toBe('IGNORED');
        });

        it('debería ignorar PROBLEM con stateType=SOFT', async () => {
            const dto = buildAlert({
                notificationType: NagiosNotificationType.PROBLEM,
                stateType: NagiosStateType.SOFT,
            });

            const result = await service.handleAlert(dto);

            expect(result.action).toBe('IGNORED');
            expect(result.reason).toContain('SOFT');
            expect(snowRequestService.create).not.toHaveBeenCalled();
        });
    });

    // ─── PROBLEM HARD ────────────────────────────────────────────────────────

    describe('handleAlert() — PROBLEM HARD', () => {
        it('debería encolar un nuevo ticket cuando no existe registro activo con el mismo fingerprint', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto = buildAlert();
            const result = await service.handleAlert(dto);

            expect(result.action).toBe('QUEUED');
            expect(result.correlationId).toBeTruthy();
            expect(result.internalNumber).toMatch(/^MON-/);
            expect(snowRequestService.create).toHaveBeenCalledTimes(1);

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.type).toBe(RequestType.INCIDENT);
            expect(createCall.status).toBe(STATUS.QUEUED);
            expect(createCall.source).toBe('nagios-thruk');
        });

        it('debería retornar DEDUPLICATED cuando ya existe un registro activo con el mismo fingerprint', async () => {
            const existing = buildEntity({ status: STATUS.QUEUED });
            snowRequestService.findActiveByFingerprint.mockResolvedValue(existing);

            const dto = buildAlert();
            const result = await service.handleAlert(dto);

            expect(result.action).toBe('DEDUPLICATED');
            expect(result.correlationId).toBe(existing.correlationId);
            expect(result.internalNumber).toBe(existing.internalNumber);
            expect(snowRequestService.create).not.toHaveBeenCalled();
        });

        it('debería mapear state DOWN a prioridad CRITICAL', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto = buildAlert({ state: 'DOWN' });
            await service.handleAlert(dto);

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.priority).toBe(4); // CRITICAL = 4
        });

        it('debería mapear state WARNING a prioridad HIGH', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto = buildAlert({ state: 'WARNING' });
            await service.handleAlert(dto);

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.priority).toBe(3); // HIGH = 3
        });

        it('debería mapear state UNKNOWN a prioridad MEDIUM', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto = buildAlert({ state: 'UNKNOWN' });
            await service.handleAlert(dto);

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.priority).toBe(2); // MEDIUM = 2
        });

        it('debería establecer expiresAt cuando se proporciona ttlSeconds', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const before = Date.now();
            const dto = buildAlert({ ttlSeconds: 120 });
            await service.handleAlert(dto);
            const after = Date.now();

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.expiresAt).toBeInstanceOf(Date);
            expect(createCall.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 120000 - 100);
            expect(createCall.expiresAt!.getTime()).toBeLessThanOrEqual(after + 120000 + 100);
        });

        it('debería dejar expiresAt como null cuando no se proporciona ttlSeconds', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto = buildAlert();
            await service.handleAlert(dto);

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.expiresAt).toBeNull();
        });
    });

    // ─── RECOVERY ────────────────────────────────────────────────────────────

    describe('handleAlert() — RECOVERY', () => {
        it('debería retornar CANCELLED cuando hay un ticket QUEUED activo', async () => {
            const entity = buildEntity({ status: STATUS.QUEUED });
            snowRequestService.cancelByFingerprint.mockResolvedValue({
                action: 'CANCELLED',
                entity: { ...entity, status: STATUS.CANCELLED },
            });

            const dto = buildAlert({ notificationType: NagiosNotificationType.RECOVERY });
            const result = await service.handleAlert(dto);

            expect(result.action).toBe('CANCELLED');
            expect(result.correlationId).toBe(entity.correlationId);
        });

        it('debería retornar TOO_LATE cuando el ticket está IN_PROGRESS', async () => {
            const entity = buildEntity({ status: STATUS.IN_PROGRESS });
            snowRequestService.cancelByFingerprint.mockResolvedValue({
                action: 'TOO_LATE',
                entity,
            });

            const dto = buildAlert({ notificationType: NagiosNotificationType.RECOVERY });
            const result = await service.handleAlert(dto);

            expect(result.action).toBe('TOO_LATE');
        });

        it('debería retornar RESOLVED_IN_SN y llamar a patchToServiceNow cuando el ticket está DELIVERED sin resolvedAt', async () => {
            const entity = buildEntity({ status: STATUS.DELIVERED, sysId: 'sys-001', resolvedAt: null });
            snowRequestService.cancelByFingerprint.mockResolvedValue({
                action: 'RESOLVED',
                entity,
            });
            snowClient.patchToServiceNow.mockResolvedValue(undefined);

            const dto = buildAlert({ notificationType: NagiosNotificationType.RECOVERY });
            const result = await service.handleAlert(dto);

            expect(result.action).toBe('RESOLVED_IN_SN');
            expect(result.sysId).toBe('sys-001');
            expect(snowClient.patchToServiceNow).toHaveBeenCalledWith(
                entity.type,
                'sys-001',
                expect.objectContaining({ state: 'resolved' }),
            );
        });

        it('debería retornar RESOLVED_IN_SN aunque patchToServiceNow falle (error se absorbe)', async () => {
            const entity = buildEntity({ status: STATUS.DELIVERED, sysId: 'sys-001', resolvedAt: null });
            snowRequestService.cancelByFingerprint.mockResolvedValue({
                action: 'RESOLVED',
                entity,
            });
            snowClient.patchToServiceNow.mockRejectedValue(new Error('SN connection refused'));

            const dto = buildAlert({ notificationType: NagiosNotificationType.RECOVERY });
            const result = await service.handleAlert(dto);

            expect(result.action).toBe('RESOLVED_IN_SN');
        });

        it('debería retornar IGNORED cuando no hay ticket activo con ese fingerprint', async () => {
            snowRequestService.cancelByFingerprint.mockResolvedValue(null);

            const dto = buildAlert({ notificationType: NagiosNotificationType.RECOVERY });
            const result = await service.handleAlert(dto);

            expect(result.action).toBe('IGNORED');
        });

        it('debería no llamar a patchToServiceNow cuando sysId es null en RESOLVED', async () => {
            const entity = buildEntity({ status: STATUS.DELIVERED, sysId: undefined, resolvedAt: null });
            snowRequestService.cancelByFingerprint.mockResolvedValue({
                action: 'RESOLVED',
                entity,
            });

            const dto = buildAlert({ notificationType: NagiosNotificationType.RECOVERY });
            await service.handleAlert(dto);

            expect(snowClient.patchToServiceNow).not.toHaveBeenCalled();
        });
    });

    // ─── Fingerprints ────────────────────────────────────────────────────────

    describe('buildFingerprint — comportamiento de deduplicación', () => {
        it('debería generar el mismo fingerprint para el mismo host/service', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto1 = buildAlert({ host: 'server-01', service: 'HTTP' });
            const dto2 = buildAlert({ host: 'server-01', service: 'HTTP', state: 'WARNING' });

            await service.handleAlert(dto1);
            await service.handleAlert(dto2);

            const fp1 = snowRequestService.findActiveByFingerprint.mock.calls[0][0];
            const fp2 = snowRequestService.findActiveByFingerprint.mock.calls[1][0];
            expect(fp1).toBe(fp2);
        });

        it('debería generar fingerprints distintos para hosts diferentes', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto1 = buildAlert({ host: 'server-01', service: 'HTTP' });
            const dto2 = buildAlert({ host: 'server-02', service: 'HTTP' });

            await service.handleAlert(dto1);
            await service.handleAlert(dto2);

            const fp1 = snowRequestService.findActiveByFingerprint.mock.calls[0][0];
            const fp2 = snowRequestService.findActiveByFingerprint.mock.calls[1][0];
            expect(fp1).not.toBe(fp2);
        });
    });
});
