// test/unit/application/process-appointment-created.usecase.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';

import { ProcessAppointmentCreatedUseCase } from '../../../src/application/use-cases/process-appointment-created.usecase';
import { IntegrationEvent } from '../../../src/domain/entities/integration-event.entity';
import { ExternalSystem } from '../../../src/domain/entities/external-system.entity';
import { MinervaConnector } from '../../../src/infrastructure/external/connectors/minerva.connector';
import { CircuitBreakerService } from '../../../src/infrastructure/services/circuit-breaker.service';

describe('ProcessAppointmentCreatedUseCase', () => {
    let useCase: ProcessAppointmentCreatedUseCase;
    let mockIntegrationRepository: any;
    let mockExternalSystemRepository: any;
    let mockServiceNowStrategy: any;
    let mockMinervaConnector: any;
    let mockCircuitBreaker: any;

    beforeEach(async () => {
        mockIntegrationRepository = {
            save: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
        };

        mockExternalSystemRepository = {
            findById: jest.fn(),
            update: jest.fn(),
        };

        mockServiceNowStrategy = {
            createIncident: jest.fn(),
            updateIncident: jest.fn(),
            getIncidentStatus: jest.fn(),
            healthCheck: jest.fn(),
        };

        mockMinervaConnector = {
            assignDevice: jest.fn(),
            releaseDevice: jest.fn(),
        };

        mockCircuitBreaker = {
            execute: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProcessAppointmentCreatedUseCase,
                {
                    provide: 'IIntegrationEventRepository',
                    useValue: mockIntegrationRepository,
                },
                {
                    provide: 'IExternalSystemRepository',
                    useValue: mockExternalSystemRepository,
                },
                {
                    provide: 'SERVICENOW_STRATEGY',
                    useValue: mockServiceNowStrategy,
                },
                {
                    provide: MinervaConnector,
                    useValue: mockMinervaConnector,
                },
                {
                    provide: CircuitBreakerService,
                    useValue: mockCircuitBreaker,
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(),
                    },
                },
                {
                    provide: EventPublisher,
                    useValue: {
                        mergeObjectContext: jest.fn().mockReturnValue({
                            commit: jest.fn(),
                            publish: jest.fn(),
                        }),
                    },
                },
            ],
        }).compile();

        useCase = module.get<ProcessAppointmentCreatedUseCase>(ProcessAppointmentCreatedUseCase);
    });

    it('should be defined', () => {
        expect(useCase).toBeDefined();
    });

    describe('execute', () => {
        it('should process appointment successfully', async () => {
            // Arrange
            const dto = {
                eventType: 'appointment.created',
                source: 'appointment-service',
                payload: {
                    appointmentId: '123',
                    userId: '456',
                    serialNumber: 'SN001',
                    cornerId: 'C001',
                },
                correlationId: 'corr-123',
            };

            const mockEvent = {
                id: 'event-123',
                correlationId: 'corr-123',
                payload: dto.payload,
                steps: [],
                markAsProcessing: jest.fn(),
                markAsCompleted: jest.fn(),
                markAsFailed: jest.fn(),
                shouldRetry: jest.fn().mockReturnValue(false),
                incrementRetry: jest.fn(),
                commit: jest.fn(),
                publish: jest.fn(),
            };

            mockIntegrationRepository.save.mockResolvedValue(mockEvent);
            mockIntegrationRepository.update.mockResolvedValue(mockEvent);

            mockExternalSystemRepository.findById
                .mockResolvedValueOnce({
                    id: 'servicenow',
                    name: 'ServiceNow',
                    canExecute: () => true,
                    recordSuccess: jest.fn(),
                })
                .mockResolvedValueOnce({
                    id: 'minerva',
                    name: 'Minerva',
                    canExecute: () => true,
                    recordSuccess: jest.fn(),
                });

            mockCircuitBreaker.execute
                .mockResolvedValueOnce({ correlationId: 'corr-001', status: 'QUEUED' })
                .mockResolvedValueOnce({ assignmentId: 'assign-001', status: 'ASSIGNED' });

            // Act
            await useCase.execute(dto);

            // Assert
            expect(mockIntegrationRepository.save).toHaveBeenCalled();
            expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(2);
        });
    });
});
