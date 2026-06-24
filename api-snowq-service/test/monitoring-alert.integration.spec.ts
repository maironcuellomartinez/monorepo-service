import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';
import { SnowRequestService } from 'src/snow-requests/services/snow-request.service';
import { MonitoringService } from 'src/monitoring/monitoring.service';
import { ServiceNowClientService } from 'src/servicenow/client/servicenow-client.service';
import { NagiosNotificationType, NagiosStateType, ThrukAlertDto } from 'src/monitoring/dto/thruk-alert.dto';
import { STATUS } from 'src/common';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

function buildAlert(overrides: Partial<ThrukAlertDto> = {}): ThrukAlertDto {
    const suffix = randomUUID().substring(0, 6);
    return {
        notificationType: NagiosNotificationType.PROBLEM,
        host: `host-${suffix}`,
        service: `service-${suffix}`,
        state: 'CRITICAL',
        stateType: NagiosStateType.HARD,
        checkAttempt: 3,
        maxCheckAttempts: 3,
        output: `CRITICAL - Test output ${suffix}`,
        ...overrides,
    } as ThrukAlertDto;
}

describe('MonitoringService — Integration (DB real, HTTP mockeado)', () => {
    let module: TestingModule;
    let service: MonitoringService;
    let snowRequestService: SnowRequestService;
    let snowClientMock: jest.Mocked<ServiceNowClientService>;
    let repo: Repository<SnowRequestEntity>;

    beforeAll(async () => {
        snowClientMock = {
            patchToServiceNow: jest.fn().mockResolvedValue(undefined),
            postToServiceNow: jest.fn(),
            getTicketState: jest.fn(),
        } as unknown as jest.Mocked<ServiceNowClientService>;

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
            providers: [
                SnowRequestService,
                MonitoringService,
                { provide: ServiceNowClientService, useValue: snowClientMock },
            ],
        }).compile();

        service = module.get<MonitoringService>(MonitoringService);
        snowRequestService = module.get<SnowRequestService>(SnowRequestService);
        repo = module.get<Repository<SnowRequestEntity>>(getRepositoryToken(SnowRequestEntity));
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        snowClientMock.patchToServiceNow.mockResolvedValue(undefined);
    });

    // ─── PROBLEM HARD crea registro en DB ───────────────────────────────────

    it('PROBLEM HARD → crea registro QUEUED en DB verificable por correlationId', async () => {
        const dto = buildAlert();
        const result = await service.handleAlert(dto);

        expect(result.action).toBe('QUEUED');
        expect(result.correlationId).toBeTruthy();

        const inDb = await snowRequestService.findByCorrelationId(result.correlationId!);
        expect(inDb).not.toBeNull();
        expect(inDb!.status).toBe(STATUS.QUEUED);
        expect(inDb!.source).toBe('nagios-thruk');
        expect(inDb!.internalNumber).toBe(result.internalNumber);
    });

    // ─── Deduplicación: segundo PROBLEM HARD con mismo host/service ─────────

    it('PROBLEM HARD duplicado → segundo call retorna DEDUPLICATED y solo hay 1 registro en DB', async () => {
        // Mismo host y service → mismo fingerprint
        const host = `dedup-host-${randomUUID().substring(0, 6)}`;
        const svc = `dedup-svc-${randomUUID().substring(0, 6)}`;

        const dto1 = buildAlert({ host, service: svc });
        const dto2 = buildAlert({ host, service: svc });

        const result1 = await service.handleAlert(dto1);
        const result2 = await service.handleAlert(dto2);

        expect(result1.action).toBe('QUEUED');
        expect(result2.action).toBe('DEDUPLICATED');

        // Mismo correlationId
        expect(result2.correlationId).toBe(result1.correlationId);

        // Solo un registro en DB con ese fingerprint
        const allRecords = await repo.find({ where: { correlationId: result1.correlationId! } });
        expect(allRecords.length).toBe(1);
    });

    // ─── RECOVERY cancela registro QUEUED ───────────────────────────────────

    it('RECOVERY después de PROBLEM HARD → registro cambia a CANCELLED en DB', async () => {
        const host = `recovery-host-${randomUUID().substring(0, 6)}`;
        const svc = `recovery-svc-${randomUUID().substring(0, 6)}`;

        // Crear el ticket
        const problemDto = buildAlert({ host, service: svc });
        const problemResult = await service.handleAlert(problemDto);
        expect(problemResult.action).toBe('QUEUED');

        // Enviar recovery
        const recoveryDto = buildAlert({
            host,
            service: svc,
            notificationType: NagiosNotificationType.RECOVERY,
            state: 'OK',
            stateType: NagiosStateType.HARD,
        });
        const recoveryResult = await service.handleAlert(recoveryDto);

        expect(recoveryResult.action).toBe('CANCELLED');

        // Verificar en DB
        const inDb = await snowRequestService.findByCorrelationId(problemResult.correlationId!);
        expect(inDb!.status).toBe(STATUS.CANCELLED);
    });

    // ─── RECOVERY con ticket DELIVERED → RESOLVED_IN_SN, resolvedAt en DB ──

    it('PROBLEM HARD → update manual a DELIVERED → RECOVERY → action=RESOLVED_IN_SN y resolvedAt en DB', async () => {
        const host = `resolved-host-${randomUUID().substring(0, 6)}`;
        const svc = `resolved-svc-${randomUUID().substring(0, 6)}`;

        // Crear el ticket
        const problemDto = buildAlert({ host, service: svc });
        const problemResult = await service.handleAlert(problemDto);
        expect(problemResult.action).toBe('QUEUED');

        // Simular que el ticket llegó a ServiceNow: actualizar manualmente a DELIVERED
        await repo.update(
            { correlationId: problemResult.correlationId! },
            {
                status: STATUS.DELIVERED,
                sysId: 'sys-resolved-integration',
                snowNumber: 'INC-RESOLVED',
                resolvedAt: null,
            },
        );

        // Verificar estado intermedio
        const beforeRecovery = await snowRequestService.findByCorrelationId(problemResult.correlationId!);
        expect(beforeRecovery!.status).toBe(STATUS.DELIVERED);
        expect(beforeRecovery!.resolvedAt).toBeNull();

        // Enviar recovery
        const recoveryDto = buildAlert({
            host,
            service: svc,
            notificationType: NagiosNotificationType.RECOVERY,
            state: 'OK',
            stateType: NagiosStateType.HARD,
        });
        const recoveryResult = await service.handleAlert(recoveryDto);

        expect(recoveryResult.action).toBe('RESOLVED_IN_SN');
        expect(recoveryResult.sysId).toBe('sys-resolved-integration');
        expect(recoveryResult.snowNumber).toBe('INC-RESOLVED');

        // patchToServiceNow debe haber sido llamado
        expect(snowClientMock.patchToServiceNow).toHaveBeenCalledWith(
            expect.any(String),
            'sys-resolved-integration',
            expect.objectContaining({ state: 'resolved' }),
        );

        // resolvedAt debe estar en DB
        const afterRecovery = await snowRequestService.findByCorrelationId(problemResult.correlationId!);
        expect(afterRecovery!.resolvedAt).toBeInstanceOf(Date);
    });
});
