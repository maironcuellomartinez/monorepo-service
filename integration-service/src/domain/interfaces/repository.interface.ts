// src/domain/interfaces/repository.interface.ts
import { IntegrationEvent } from '../entities/integration-event.entity';
import { ExternalSystem } from '../../infrastructure/entities/external-system.entity';

export interface IIntegrationEventRepository {
    save(event: IntegrationEvent): Promise<IntegrationEvent>;
    update(event: IntegrationEvent): Promise<IntegrationEvent>;
    findById(id: string): Promise<IntegrationEvent | null>;
    findByCorrelationId(correlationId: string): Promise<IntegrationEvent | null>;
    findPendingEvents(): Promise<IntegrationEvent[]>;
    findStuckProcessing(olderThanMinutes: number): Promise<IntegrationEvent[]>;
}

export interface IExternalSystemRepository {
    findById(id: string): Promise<ExternalSystem | null>;
    findBySystem(systemType: string): Promise<ExternalSystem | null>;
    findAll(): Promise<ExternalSystem[]>;
    update(system: ExternalSystem): Promise<ExternalSystem>;
    updateCircuitState(id: string, state: string): Promise<void>;
}