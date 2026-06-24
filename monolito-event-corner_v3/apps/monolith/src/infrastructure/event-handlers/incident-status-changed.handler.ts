// infrastructure/event-handlers/incident-status-changed.handler.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '@app/shared/domain-event';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { IIncidentRepository } from '@app/core/ports/outgoing/repositories/incident-repository.port';
import { ServiceNowIntegrationService } from '@app/core/services/servicenow/servicenow-integration.service';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import { INCIDENT_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IncidentId } from '@app/shared/types/branded-ids';
import { IncidentStatus } from '@app/core/domain/enums/incident-status.enum';

@Injectable()
export class IncidentStatusChangedHandler implements OnModuleInit {
    private readonly logger = new Logger(IncidentStatusChangedHandler.name);

    constructor(
        @Inject(IN_MEMORY_EVENT_BUS) private readonly eventBus: IEventBus,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly snService: ServiceNowIntegrationService,
        @Inject(INCIDENT_REPOSITORY) private readonly incidentRepo: IIncidentRepository,
    ) { }

    onModuleInit(): void {
        this.eventBus.subscribe('INCIDENT_STATUS_CHANGED', (event) => this.handleStatusChanged(event));
        this.eventBus.subscribe('INCIDENT_REOPENED', (event) => this.handleReopened(event));
    }

    private async handleStatusChanged(event: DomainEvent): Promise<void> {
        const newStatus: IncidentStatus = event.data?.newStatus;

        // Only CLOSED needs a ServiceNow call; other transitions are internal state changes
        if (newStatus !== IncidentStatus.CLOSED) return;

        const incident = await this.loadIncident(event.aggregateId, 'INCIDENT_STATUS_CHANGED');
        if (!incident) return;

        // Idempotency: if the ticket was never created in SN there is nothing to close
        if (!incident.servicenowId) {
            this.logger.warn(`[INCIDENT_STATUS_CHANGED] Incident ${event.aggregateId} has no SN ticket — skipping close`);
            return;
        }

        const closeCategory: string = event.data?.closeCategory ?? 'resolved';
        const closeNotes: string | undefined = event.data?.comment;

        const result = await this.snService.closeIncidentTicket(
            incident.servicenowId.value,
            closeCategory,
            closeNotes,
        );

        if (result.isFailure) {
            const msg = `[INCIDENT_STATUS_CHANGED] Failed to close SN ticket for incident ${event.aggregateId}: ${result.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        this.logger.log(`[INCIDENT_STATUS_CHANGED] SN ticket closed for incident ${event.aggregateId} — sysId: ${incident.servicenowId.value}`);
    }

    private async handleReopened(event: DomainEvent): Promise<void> {
        const incident = await this.loadIncident(event.aggregateId, 'INCIDENT_REOPENED');
        if (!incident) return;

        if (!incident.servicenowId) {
            this.logger.warn(`[INCIDENT_REOPENED] Incident ${event.aggregateId} has no SN ticket — skipping reopen`);
            return;
        }

        // SN state 2 = In Progress (reopened)
        const result = await this.snService.updateTicket('incident', incident.servicenowId.value, {
            state: '2',
            work_notes: event.data?.reason ?? 'Reabierto desde Event Corner',
        });

        if (result.isFailure) {
            const msg = `[INCIDENT_REOPENED] Failed to reopen SN ticket for incident ${event.aggregateId}: ${result.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        this.logger.log(`[INCIDENT_REOPENED] SN ticket reopened for incident ${event.aggregateId} — sysId: ${incident.servicenowId.value}`);
    }

    private async loadIncident(aggregateId: string, context: string) {
        const result = await this.incidentRepo.findById(aggregateId as IncidentId);
        if (result.isFailure) {
            this.logger.error(`[${context}] Could not load incident ${aggregateId}: ${result.unwrapError().message}`);
            return null;
        }
        const incident = result.unwrap();
        if (!incident) {
            this.logger.warn(`[${context}] Incident ${aggregateId} not found`);
            return null;
        }
        return incident;
    }
}
