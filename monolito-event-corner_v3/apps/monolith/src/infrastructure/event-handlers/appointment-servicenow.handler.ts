// infrastructure/event-handlers/appointment-servicenow.handler.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '@app/shared/domain-event';
import { CorrelationIdService, TracingService } from '@app/observability';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { IAppointmentRepository } from '@app/core/ports/outgoing/repositories/appointment-repository.port';
import { ITicketLinkRepository } from '@app/core/ports/outgoing/repositories/servicenow-ticket-link-repository.port';
import { ICompanyRepository } from '@app/core/ports/outgoing/repositories/company-repository.port';
import { IUserRepository } from '@app/core/ports/outgoing/repositories/user-repository.port';
import { ServiceNowIntegrationService } from '@app/core/services/servicenow/servicenow-integration.service';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import {
    APPOINTMENT_REPOSITORY,
    SERVICENOW_TICKET_LINK_REPOSITORY,
    COMPANY_REPOSITORY,
    USER_REPOSITORY,
} from '@app/core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { AppointmentId } from '@app/shared/types/branded-ids';
import { AppointmentKind } from '@app/core/domain/enums/appointment-kind.enum';

/**
 * Reemplaza IncidentServiceNowHandler + RequestServiceNowHandler.
 * Se suscribe a APPOINTMENT_CREATED (que, a diferencia de REQUEST_CREATED
 * antes, SIEMPRE se emite — ver Appointment.create()) y crea el ticket SN
 * correspondiente según `kind` (incident | sc_req_item), persistiendo el
 * resultado como un ServiceNowTicketLink propio en vez de mutar el agregado.
 */
@Injectable()
export class AppointmentServiceNowHandler implements OnModuleInit {
    private readonly logger = new Logger(AppointmentServiceNowHandler.name);

    constructor(
        @Inject(IN_MEMORY_EVENT_BUS) private readonly eventBus: IEventBus,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly serviceNowService: ServiceNowIntegrationService,
        @Inject(APPOINTMENT_REPOSITORY) private readonly appointmentRepository: IAppointmentRepository,
        @Inject(SERVICENOW_TICKET_LINK_REPOSITORY) private readonly ticketLinkRepository: ITicketLinkRepository,
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository,
        private readonly correlation: CorrelationIdService,
        private readonly tracing: TracingService,
    ) { }

    onModuleInit(): void {
        if (process.env.SN_INTEGRATION_ENABLED !== 'true') {
            this.logger.log('[APPOINTMENT_CREATED] SN_INTEGRATION_ENABLED != true — handler disabled');
            return;
        }
        this.eventBus.subscribe('APPOINTMENT_CREATED', (event) => this.handle(event));
    }

    private async handle(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.appointmentCreated',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handle(event),
        );
    }

    private async _handle(event: DomainEvent): Promise<void> {
        const appointmentResult = await this.appointmentRepository.findById(event.aggregateId as AppointmentId);
        if (appointmentResult.isFailure) {
            this.logger.error(`[APPOINTMENT_CREATED] Could not load appointment ${event.aggregateId}: ${appointmentResult.unwrapError().message}`);
            return;
        }
        const appointment = appointmentResult.unwrap();
        if (!appointment) {
            this.logger.warn(`[APPOINTMENT_CREATED] Appointment ${event.aggregateId} not found`);
            return;
        }

        // Idempotency guard: skip if a non-abandoned ticket link already exists.
        const existingLinksResult = await this.ticketLinkRepository.findByAppointmentId(appointment.id);
        if (existingLinksResult.isSuccess) {
            const hasActiveLink = existingLinksResult.unwrap().some((l) => l.status !== 'ABANDONED');
            if (hasActiveLink) {
                this.logger.debug(`[APPOINTMENT_CREATED] Appointment ${event.aggregateId} already has an active ticket link — skipping`);
                return;
            }
        }

        const companyResult = await this.companyRepository.findById(appointment.companyId);
        if (companyResult.isFailure) {
            this.logger.error(`[APPOINTMENT_CREATED] Could not load company ${appointment.companyId}: ${companyResult.unwrapError().message}`);
            return;
        }
        const company = companyResult.unwrap();
        if (!company) {
            this.logger.warn(`[APPOINTMENT_CREATED] Company ${appointment.companyId} not found`);
            return;
        }

        const userResult = await this.userRepository.findById(appointment.customerId);
        const user = userResult.isSuccess ? userResult.unwrap() : null;

        const ticketType = appointment.kind === AppointmentKind.ISSUE ? 'incident' : 'sc_req_item';
        const creatorTechnicianEmail: string | undefined = event.data?.creatorTechnicianEmail ?? undefined;

        const callerPrincipalName = appointment.kind === AppointmentKind.ISSUE ? (user?.upn ?? undefined) : undefined;
        const requestedForOrCreatorEmail = appointment.kind === AppointmentKind.ISSUE
            ? creatorTechnicianEmail
            : (user?.upn ?? undefined);

        const result = await this.serviceNowService.createTicket(
            appointment,
            ticketType,
            company,
            callerPrincipalName,
            requestedForOrCreatorEmail,
        );
        if (result.isFailure) {
            const msg = `[APPOINTMENT_CREATED] Failed to create SN ticket for appointment ${event.aggregateId}: ${result.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        const link = result.unwrap();
        const saveResult = await this.ticketLinkRepository.save(link);
        if (saveResult.isFailure) {
            const msg = `[APPOINTMENT_CREATED] Failed to persist ticket link for appointment ${event.aggregateId}: ${saveResult.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        if (link.snowqCorrelationId) {
            this.logger.log(`[APPOINTMENT_CREATED] Appointment ${event.aggregateId} queued in broker — correlationId: ${link.snowqCorrelationId}`);
        } else {
            this.logger.log(`[APPOINTMENT_CREATED] SN ticket created for appointment ${event.aggregateId} — sysId: ${link.sysId?.value}`);
        }
    }
}
