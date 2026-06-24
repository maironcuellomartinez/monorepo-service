// Mockeamos los módulos que importan dependencias ESM (p-queue, etc.)
// antes de cualquier importación del código bajo prueba.
jest.mock('./snow-request-queue.service');

import { SnowRequestProcessingService } from './snow-request-processing.service';
import { SnowRequestService } from './snow-request.service';
import { SnowRequestQueueService } from './snow-request-queue.service';
import { ServiceNowClientService } from 'src/servicenow/client/servicenow-client.service';
import { BaseSnowRequestDto } from 'src/common/dto/base-snow-request.dto';
import { RequestPriority, RequestType, STATUS } from 'src/common';
import { SnowRequestEntity } from '../entities/snow-request.entity';

function buildEntity(overrides: Partial<SnowRequestEntity> = {}): SnowRequestEntity {
    return {
        id: 1,
        correlationId: 'mock-correlation-id',
        internalNumber: 'SNQ-MOCKTEST',
        type: RequestType.INCIDENT,
        priority: RequestPriority.MEDIUM,
        payload: { incidentId: 'INC-001' },
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

function buildDto(payloadOverrides: Record<string, unknown> = {}): BaseSnowRequestDto {
    return {
        severity: 'medium',
        impact: 2,
        urgency: 2,
        priority: RequestPriority.MEDIUM,
        source: 'test-source',
        payload: { incidentId: 'INC-001', ...payloadOverrides },
    } as BaseSnowRequestDto;
}

describe('SnowRequestProcessingService', () => {
    let service: SnowRequestProcessingService;
    let snowRequestService: jest.Mocked<SnowRequestService>;
    let queueService: jest.Mocked<SnowRequestQueueService>;
    let snClient: jest.Mocked<ServiceNowClientService>;

    beforeEach(() => {
        snowRequestService = {
            create: jest.fn(),
            findByCorrelationId: jest.fn(),
            findActiveByFingerprint: jest.fn(),
            markAsDelivered: jest.fn(),
            markAsFailed: jest.fn(),
            markAsRetry: jest.fn(),
            markAsQueued: jest.fn(),
            markAsProcessing: jest.fn(),
        } as unknown as jest.Mocked<SnowRequestService>;

        queueService = {
            sendToServiceNow: jest.fn(),
            enqueue: jest.fn(),
            onModuleInit: jest.fn(),
        } as unknown as jest.Mocked<SnowRequestQueueService>;

        snClient = {
            patchToServiceNow: jest.fn(),
            postToServiceNow: jest.fn(),
            getTicketState: jest.fn(),
        } as unknown as jest.Mocked<ServiceNowClientService>;

        service = new SnowRequestProcessingService(snowRequestService, queueService, snClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ─── enqueue ─────────────────────────────────────────────────────────────

    describe('enqueue()', () => {
        it('debería crear una nueva entidad QUEUED cuando no existe un registro activo con el mismo fingerprint', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            const newEntity = buildEntity();
            snowRequestService.create.mockResolvedValue(newEntity);

            const dto = buildDto();
            const result = await service.enqueue(RequestType.INCIDENT, dto);

            expect(snowRequestService.findActiveByFingerprint).toHaveBeenCalledTimes(1);
            expect(snowRequestService.create).toHaveBeenCalledTimes(1);

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.type).toBe(RequestType.INCIDENT);
            expect(createCall.status).toBe(STATUS.QUEUED);
            expect(createCall.immediate).toBe(false);

            expect(result.deduplicated).toBe(false);
            expect(result.correlationId).toBeTruthy();
            expect(result.internalNumber).toMatch(/^SNQ-/);
        });

        it('debería retornar la entidad existente sin crear cuando ya existe un registro activo (deduplicación)', async () => {
            const existingEntity = buildEntity({
                correlationId: 'existing-corr-id',
                internalNumber: 'SNQ-EXISTING',
            });
            snowRequestService.findActiveByFingerprint.mockResolvedValue(existingEntity);

            const dto = buildDto();
            const result = await service.enqueue(RequestType.INCIDENT, dto);

            expect(snowRequestService.create).not.toHaveBeenCalled();
            expect(result.deduplicated).toBe(true);
            expect(result.correlationId).toBe('existing-corr-id');
            expect(result.internalNumber).toBe('SNQ-EXISTING');
        });

        it('debería siempre crear (sin dedup) cuando el payload no tiene campos de identidad', async () => {
            const dto: BaseSnowRequestDto = {
                severity: 'low',
                impact: 1,
                urgency: 1,
                priority: RequestPriority.LOW,
                source: 'test',
                payload: { description: 'sin campo de identidad' },
            } as BaseSnowRequestDto;

            const newEntity = buildEntity();
            snowRequestService.create.mockResolvedValue(newEntity);

            const result = await service.enqueue(RequestType.INCIDENT, dto);

            // No debe llamar a findActiveByFingerprint si no hay fingerprint
            expect(snowRequestService.findActiveByFingerprint).not.toHaveBeenCalled();
            expect(snowRequestService.create).toHaveBeenCalledTimes(1);
            expect(result.deduplicated).toBe(false);
        });

        it('debería generar fingerprints diferentes para distintos tipos con el mismo payload', async () => {
            snowRequestService.findActiveByFingerprint.mockResolvedValue(null);
            snowRequestService.create.mockResolvedValue(buildEntity());

            const dto = buildDto({ incidentId: 'ID-001' });

            await service.enqueue(RequestType.INCIDENT, dto);
            await service.enqueue(RequestType.PROBLEM, dto);

            const fp1 = snowRequestService.findActiveByFingerprint.mock.calls[0][0];
            const fp2 = snowRequestService.findActiveByFingerprint.mock.calls[1][0];
            expect(fp1).not.toBe(fp2);
        });
    });

    // ─── processImmediate ────────────────────────────────────────────────────

    describe('processImmediate()', () => {
        it('debería crear entidad IN_PROGRESS, llamar a sendToServiceNow, marcar como DELIVERED y retornar los ids de SN', async () => {
            const entity = buildEntity({ status: STATUS.IN_PROGRESS });
            snowRequestService.create.mockResolvedValue(entity);
            queueService.sendToServiceNow.mockResolvedValue({ sys_id: 'sys-001', snowNumber: 'INC0001' });
            snowRequestService.markAsDelivered.mockResolvedValue(undefined);

            const dto = buildDto();
            const result = await service.processImmediate(RequestType.INCIDENT, dto);

            expect(snowRequestService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: STATUS.IN_PROGRESS,
                    immediate: true,
                }),
            );

            // Debe pasar la entidad real devuelta por create()
            expect(queueService.sendToServiceNow).toHaveBeenCalledWith(entity);

            // El servicio usa el correlationId generado internamente (obtenido de la llamada a create)
            const createCallArgs = snowRequestService.create.mock.calls[0][0];
            expect(snowRequestService.markAsDelivered).toHaveBeenCalledWith(
                createCallArgs.correlationId,
                'sys-001',
                'INC0001',
            );

            expect(result).toEqual({ sys_id: 'sys-001', snowNumber: 'INC0001' });
        });

        it('debería llamar a markAsFailed y relanzar el error cuando sendToServiceNow falla', async () => {
            const entity = buildEntity({ status: STATUS.IN_PROGRESS });
            snowRequestService.create.mockResolvedValue(entity);

            const snError = new Error('ServiceNow timeout');
            queueService.sendToServiceNow.mockRejectedValue(snError);
            snowRequestService.markAsFailed.mockResolvedValue(undefined);

            const dto = buildDto();

            await expect(service.processImmediate(RequestType.INCIDENT, dto)).rejects.toThrow('ServiceNow timeout');

            // El correlationId pasado a markAsFailed es el generado internamente (mismo que se pasó a create)
            const createCallArgs = snowRequestService.create.mock.calls[0][0];
            expect(snowRequestService.markAsFailed).toHaveBeenCalledWith(
                createCallArgs.correlationId,
                'ServiceNow timeout',
            );
            expect(snowRequestService.markAsDelivered).not.toHaveBeenCalled();
        });

        it('debería crear la entidad con immediate=true y fingerprint=null', async () => {
            const entity = buildEntity({ status: STATUS.IN_PROGRESS, immediate: true, fingerprint: null });
            snowRequestService.create.mockResolvedValue(entity);
            queueService.sendToServiceNow.mockResolvedValue({ sys_id: 'sys-002', snowNumber: 'INC0002' });
            snowRequestService.markAsDelivered.mockResolvedValue(undefined);

            const dto = buildDto();
            await service.processImmediate(RequestType.INCIDENT, dto);

            const createCall = snowRequestService.create.mock.calls[0][0];
            expect(createCall.immediate).toBe(true);
            expect(createCall.fingerprint).toBeNull();
        });
    });
});
