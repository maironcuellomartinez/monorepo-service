import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';

import { IIntegrationEventRepository } from '../../domain/interfaces/repository.interface';
import { IExternalSystemRepository } from '../../domain/interfaces/repository.interface';
import { IntegrationEvent } from '../../domain/entities/integration-event.entity';
import { IntegrationStatus } from '../../domain/value-objects/integration-status.vo';
import { ProcessIntegrationDto } from '../dto/process-integration.dto';

import { MinervaConnector } from '../../infrastructure/external/connectors/minerva.connector';
import { IServiceNowRoutingStrategy } from '../../infrastructure/external/strategies/servicenow-routing.strategy';
import { CircuitBreakerService } from 'src/infrastructure/services';

@Injectable()
export class ProcessAppointmentCreatedUseCase {
    private readonly logger = new Logger(ProcessAppointmentCreatedUseCase.name);

    constructor(
        @Inject('IIntegrationEventRepository')
        private readonly integrationEventRepository: IIntegrationEventRepository,
        @Inject('IExternalSystemRepository')
        private readonly externalSystemRepository: IExternalSystemRepository,
        @Inject('SERVICENOW_STRATEGY') private readonly serviceNowStrategy: IServiceNowRoutingStrategy,
        private readonly minervaConnector: MinervaConnector,
        private readonly circuitBreaker: CircuitBreakerService,
        private readonly configService: ConfigService,
        private readonly publisher: EventPublisher,
    ) { }

    async execute(dto: ProcessIntegrationDto): Promise<void> {
        const { eventType, source, payload, correlationId } = dto;

        try {
            // 1. Crear evento de integración
            const integrationEvent = new IntegrationEvent(
                eventType,
                source,
                payload,
                correlationId,
            );

            const savedEvent = await this.integrationEventRepository.save(integrationEvent);
            this.publisher.mergeObjectContext(savedEvent);

            // 2. Marcar como procesando
            savedEvent.markAsProcessing();
            await this.integrationEventRepository.update(savedEvent);

            // 3. Ejecutar integraciones
            await this.executeIntegrations(savedEvent);

            // 4. Publicar evento de dominio
            savedEvent.commit();

        } catch (error) {
            this.logger.error('Failed to process appointment created', {
                error: error.message,
                correlationId,
                payload,
            });

            throw error;
        }
    }

    /**
     * Ejecuta las integraciones con los sistemas externos
     * @param event Evento de integración
     * @returns Promise<void>
     * @description
     *  1. Crea un evento de integración
     *  2. Marca como procesando
     *  3. Ejecuta las integraciones
     *  4. Publica evento de dominio
     */
    private async executeIntegrations(event: IntegrationEvent): Promise<void> {
        const integrations: Array<{ systemId: string; execute: () => Promise<any> }> = [
            {
                systemId: 'servicenow',
                execute: () => this.serviceNowStrategy.createIncident(event.payload),
            },
            {
                systemId: 'minerva',
                execute: () => this.minervaConnector.assignDevice({
                    serialNumber: event.payload.serialNumber,
                    appointmentId: event.payload.appointmentId,
                    userId: event.payload.userId,
                    cornerId: event.payload.cornerId,
                    expectedReturnDate: event.payload.expectedReturnDate,
                }),
            },
        ];

        const results = await Promise.allSettled(
            integrations.map(async (integration) => {
                try {
                    const system = await this.externalSystemRepository.findById(integration.systemId);

                    if (!system || !system.canExecute()) {
                        throw new Error(`System ${integration.systemId} is not available`);
                    }

                    const result = await this.circuitBreaker.execute(
                        system,
                        async () => await integration.execute()
                    );

                    system.recordSuccess();
                    await this.externalSystemRepository.update(system);

                    return {
                        systemId: integration.systemId,
                        success: true,
                        result,
                    };

                } catch (error) {
                    const system = await this.externalSystemRepository.findById(integration.systemId);
                    if (system) {
                        system.recordFailure();
                        await this.externalSystemRepository.update(system);
                    }

                    return {
                        systemId: integration.systemId,
                        success: false,
                        error: error.message,
                    };
                }
            })
        );

        // Procesar resultados
        const failedIntegrations = results
            .filter(result => result.status === 'fulfilled' && !result.value.success)
            .map(result => (result as PromiseFulfilledResult<any>).value);

        if (failedIntegrations.length > 0) {
            await this.handleIntegrationFailure(event, failedIntegrations);
        } else {
            event.markAsCompleted();
            await this.integrationEventRepository.update(event);

            this.logger.log('Integration completed successfully', {
                eventId: event.id,
                correlationId: event.correlationId,
            });
        }
    }

    private async handleIntegrationFailure(
        event: IntegrationEvent,
        failedIntegrations: Array<{ systemId: string; error: string }>
    ): Promise<void> {
        const errorMessage = failedIntegrations
            .map(f => `${f.systemId}: ${f.error}`)
            .join(', ');

        event.markAsFailed(errorMessage);

        if (event.shouldRetry()) {
            event.incrementRetry();
            await this.integrationEventRepository.update(event);

            // Publicar evento para reintento
            this.publisher.mergeObjectContext(event).publish({
                type: 'INTEGRATION_RETRY_REQUIRED',
                payload: {
                    eventId: event.id,
                    retryCount: event.retryCount,
                    failedSystems: failedIntegrations.map(f => f.systemId),
                },
            });

        } else {
            await this.integrationEventRepository.update(event);

            // Publicar evento para compensación
            this.publisher.mergeObjectContext(event).publish({
                type: 'INTEGRATION_COMPENSATION_REQUIRED',
                payload: {
                    eventId: event.id,
                    failedSystems: failedIntegrations.map(f => f.systemId),
                },
            });
        }
    }
}
