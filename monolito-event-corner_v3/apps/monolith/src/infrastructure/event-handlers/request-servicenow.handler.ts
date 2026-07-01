// infrastructure/event-handlers/request-servicenow.handler.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '@app/shared/domain-event';
import { TracingService } from '@app/observability';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { IRequestRepository } from '@app/core/ports/outgoing/repositories/request-repository.port';
import { ICompanyRepository } from '@app/core/ports/outgoing/repositories/company-repository.port';
import { IUserRepository } from '@app/core/ports/outgoing/repositories/user-repository.port';
import { ServiceNowIntegrationService } from '@app/core/services/servicenow/servicenow-integration.service';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import { REQUEST_REPOSITORY, COMPANY_REPOSITORY, USER_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { RequestId } from '@app/shared/types/branded-ids';

@Injectable()
export class RequestServiceNowHandler implements OnModuleInit {
    private readonly logger = new Logger(RequestServiceNowHandler.name);

    constructor(
        @Inject(IN_MEMORY_EVENT_BUS) private readonly eventBus: IEventBus,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly snService: ServiceNowIntegrationService,
        @Inject(REQUEST_REPOSITORY) private readonly requestRepo: IRequestRepository,
        @Inject(COMPANY_REPOSITORY) private readonly companyRepo: ICompanyRepository,
        @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
        private readonly tracing: TracingService,
    ) { }

    onModuleInit(): void {
        if (process.env.SN_INTEGRATION_ENABLED !== 'true') {
            this.logger.log('[REQUEST_CREATED] SN_INTEGRATION_ENABLED != true — handler disabled');
            return;
        }
        this.eventBus.subscribe('REQUEST_CREATED', (event) => this.handle(event));
    }

    private async handle(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.requestCreated',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handle(event),
        );
    }

    private async _handle(event: DomainEvent): Promise<void> {
        const requestResult = await this.requestRepo.findById(event.aggregateId as RequestId);
        if (requestResult.isFailure) {
            this.logger.error(`[REQUEST_CREATED] Could not load request ${event.aggregateId}: ${requestResult.unwrapError().message}`);
            return;
        }
        const request = requestResult.unwrap();
        if (!request) {
            this.logger.warn(`[REQUEST_CREATED] Request ${event.aggregateId} not found`);
            return;
        }

        // Idempotency guard: skip if already registered in ServiceNow
        if (request.servicenowId) {
            this.logger.debug(`[REQUEST_CREATED] Request ${event.aggregateId} already has SN id — skipping`);
            return;
        }

        const companyResult = await this.companyRepo.findById(request.companyId);
        if (companyResult.isFailure) {
            this.logger.error(`[REQUEST_CREATED] Could not load company for request ${event.aggregateId}: ${companyResult.unwrapError().message}`);
            return;
        }
        const company = companyResult.unwrap();
        if (!company) {
            this.logger.warn(`[REQUEST_CREATED] Company ${request.companyId} not found for request ${event.aggregateId}`);
            return;
        }

        // Resolver principalName del cliente para requested_for
        // (caller_id del técnico requiere technicianId → userId, se resuelve en el servicio SN como fallback)
        const customerResult = await this.userRepo.findById(request.customerId);
        const requestedForPrincipalName = !customerResult.isFailure
            ? customerResult.unwrap()?.principalName ?? undefined
            : undefined;

        const result = await this.snService.createRequestTicket(request, company, undefined, requestedForPrincipalName);
        if (result.isFailure) {
            const msg = `[REQUEST_CREATED] Failed to create SN ticket for request ${event.aggregateId}: ${result.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        // La integración maneja internamente si fue inmediato o diferido:
        //   - inmediato → request.servicenowId ya está seteado
        //   - diferido  → request.snowqCorrelationId ya está seteado
        if (request.snowqCorrelationId) {
            this.logger.log(`[REQUEST_CREATED] Request ${event.aggregateId} queued in broker — correlationId: ${request.snowqCorrelationId}`);
        } else {
            this.logger.log(`[REQUEST_CREATED] SN ticket created for request ${event.aggregateId} — sysId: ${request.servicenowId}`);
        }

        // Persist the servicenow_id / servicenow_number / snowq_correlation_id back to the DB
        const updateResult = await this.requestRepo.update(request);
        if (updateResult.isFailure) {
            const msg = `[REQUEST_CREATED] Failed to persist SN info for request ${event.aggregateId}: ${updateResult.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }
    }
}
