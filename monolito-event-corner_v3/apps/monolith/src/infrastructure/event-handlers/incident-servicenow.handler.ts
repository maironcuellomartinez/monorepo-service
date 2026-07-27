// infrastructure/event-handlers/incident-servicenow.handler.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '@app/shared/domain-event';
import { CorrelationIdService, TracingService } from '@app/observability';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { IIncidentRepository } from '@app/core/ports/outgoing/repositories/incident-repository.port';
import { ICompanyRepository } from '@app/core/ports/outgoing/repositories/company-repository.port';
import { IUserRepository } from '@app/core/ports/outgoing/repositories/user-repository.port';
import { ServiceNowIntegrationService } from '@app/core/services/servicenow/servicenow-integration.service';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import { INCIDENT_REPOSITORY, COMPANY_REPOSITORY, USER_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IncidentId } from '@app/shared/types/branded-ids';

@Injectable()
export class IncidentServiceNowHandler implements OnModuleInit {
    private readonly logger = new Logger(IncidentServiceNowHandler.name);

    constructor(
        @Inject(IN_MEMORY_EVENT_BUS) private readonly eventBus: IEventBus,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly serviceNowService: ServiceNowIntegrationService,
        @Inject(INCIDENT_REPOSITORY) private readonly incidentRepository: IIncidentRepository,
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository,
        private readonly correlation: CorrelationIdService,
        private readonly tracing: TracingService,
    ) { }

    onModuleInit(): void {
        if (process.env.SN_INTEGRATION_ENABLED !== 'true') {
            this.logger.log('[INCIDENT_CREATED] SN_INTEGRATION_ENABLED != true — handler disabled');
            return;
        }
        // The OutboxWorkerService already wraps publish() in correlation.run() with the
        // event's correlationId, so by the time this handler fires the ALS context is set.
        this.eventBus.subscribe('INCIDENT_CREATED', (event) => this.handle(event));
    }

    private async handle(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.incidentCreated',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handle(event),
        );
    }

    private async _handle(event: DomainEvent): Promise<void> {
        const incidentResult = await this.incidentRepository.findById(event.aggregateId as IncidentId);
        if (incidentResult.isFailure) {
            this.logger.error(`[INCIDENT_CREATED] Could not load incident ${event.aggregateId}: ${incidentResult.unwrapError().message}`);
            return;
        }
        const incident = incidentResult.unwrap();
        if (!incident) {
            this.logger.warn(`[INCIDENT_CREATED] Incident ${event.aggregateId} not found`);
            return;
        }

        // Idempotency guard: skip if already registered in ServiceNow
        if (incident.servicenowId) {
            this.logger.debug(`[INCIDENT_CREATED] Incident ${event.aggregateId} already has SN id — skipping`);
            return;
        }

        // Resolve company via the customer's profile
        const userResult = await this.userRepository.findById(incident.customerId);
        if (userResult.isFailure) {
            this.logger.error(`[INCIDENT_CREATED] Could not load user ${incident.customerId}: ${userResult.unwrapError().message}`);
            return;
        }
        const user = userResult.unwrap();
        if (!user || !user.companyId) {
            this.logger.warn(`[INCIDENT_CREATED] User ${incident.customerId} not found or has no company`);
            return;
        }

        const companyResult = await this.companyRepository.findById(user.companyId);
        if (companyResult.isFailure) {
            this.logger.error(`[INCIDENT_CREATED] Could not load company ${user.companyId}: ${companyResult.unwrapError().message}`);
            return;
        }
        const company = companyResult.unwrap();
        if (!company) {
            this.logger.warn(`[INCIDENT_CREATED] Company ${user.companyId} not found`);
            return;
        }

        const creatorTechnicianEmail: string | undefined = event.data?.creatorTechnicianEmail ?? undefined;
        const result = await this.serviceNowService.createIncidentTicket(incident, company, user.principalName ?? undefined, creatorTechnicianEmail);
        if (result.isFailure) {
            const msg = `[INCIDENT_CREATED] Failed to create SN ticket for incident ${event.aggregateId}: ${result.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        // La integración maneja internamente si fue inmediato o diferido:
        //   - inmediato → incident.servicenowId ya está seteado
        //   - diferido  → incident.snowqCorrelationId ya está seteado
        if (incident.snowqCorrelationId) {
            this.logger.log(`[INCIDENT_CREATED] Incident ${event.aggregateId} queued in broker — correlationId: ${incident.snowqCorrelationId}`);
        } else {
            this.logger.log(`[INCIDENT_CREATED] SN ticket created for incident ${event.aggregateId} — sysId: ${incident.servicenowId}`);
        }

        // Persist servicenow_id / servicenow_number / snowq_correlation_id back to DB
        const updateResult = await this.incidentRepository.update(incident);
        if (updateResult.isFailure) {
            const msg = `[INCIDENT_CREATED] Failed to persist SN info for incident ${event.aggregateId}: ${updateResult.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }
    }
}
