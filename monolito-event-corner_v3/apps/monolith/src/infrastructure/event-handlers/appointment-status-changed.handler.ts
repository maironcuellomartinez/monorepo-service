// infrastructure/event-handlers/appointment-status-changed.handler.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '@app/shared/domain-event';
import { TracingService } from '@app/observability';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { IAppointmentRepository } from '@app/core/ports/outgoing/repositories/appointment-repository.port';
import { ITicketLinkRepository } from '@app/core/ports/outgoing/repositories/servicenow-ticket-link-repository.port';
import { ServiceNowIntegrationService } from '@app/core/services/servicenow/servicenow-integration.service';
import { ServiceNowTicketLink } from '@app/core/domain/entities/servicenow-ticket-link.entity';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import { APPOINTMENT_REPOSITORY, SERVICENOW_TICKET_LINK_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { AppointmentId } from '@app/shared/types/branded-ids';
import { AppointmentStatus } from '@app/core/domain/enums/appointment-status.enum';

/**
 * Estado SN (semántico) para cada AppointmentStatus intermedio. IMPORTANTE:
 * nunca usar 'resolved'/'closed' acá — los tickets creados desde el monolito
 * SIEMPRE se cierran desde el monolito (no hay polling de estado desde SN,
 * ver decisión de quitar SnowSyncJob); solo el cierre real (closeTicket, más
 * abajo, disparado por APPOINTMENT_STATUS_CHANGED → CLOSED) puede usarlos.
 */
const APPOINTMENT_STATUS_TO_SN_STATE: Partial<Record<AppointmentStatus, string>> = {
    [AppointmentStatus.IN_PROGRESS]: 'in_progress',
    [AppointmentStatus.PENDING_THIRD_PARTY]: 'on_hold',
    [AppointmentStatus.PENDING_USER]: 'on_hold',
    [AppointmentStatus.PENDING_SPARE_PART]: 'on_hold',
    [AppointmentStatus.PENDING_PICKUP]: 'on_hold',
    [AppointmentStatus.PENDING_REPLACEMENT_DELIVERY]: 'on_hold',
    [AppointmentStatus.CANCELED]: 'canceled',
};

/** Reemplaza IncidentStatusChangedHandler — mismo comportamiento, sobre el ticket link "primary" de la cita en vez del campo servicenow_id inline. */
@Injectable()
export class AppointmentStatusChangedHandler implements OnModuleInit {
    private readonly logger = new Logger(AppointmentStatusChangedHandler.name);

    constructor(
        @Inject(IN_MEMORY_EVENT_BUS) private readonly eventBus: IEventBus,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly snService: ServiceNowIntegrationService,
        @Inject(APPOINTMENT_REPOSITORY) private readonly appointmentRepo: IAppointmentRepository,
        @Inject(SERVICENOW_TICKET_LINK_REPOSITORY) private readonly ticketLinkRepo: ITicketLinkRepository,
        private readonly tracing: TracingService,
    ) { }

    onModuleInit(): void {
        this.eventBus.subscribe('APPOINTMENT_STATUS_CHANGED', (event) => this.handleStatusChanged(event));
        this.eventBus.subscribe('APPOINTMENT_REOPENED', (event) => this.handleReopened(event));
        this.eventBus.subscribe('APPOINTMENT_DELIVERED', (event) => this.handleDelivered(event));
        this.eventBus.subscribe('APPOINTMENT_VALIDATED', (event) => this.handleValidated(event));
    }

    private async handleStatusChanged(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.appointmentStatusChanged',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleStatusChanged(event),
        );
    }

    private async _handleStatusChanged(event: DomainEvent): Promise<void> {
        const newStatus: AppointmentStatus = event.data?.newStatus;

        const link = await this.loadPrimaryLink(event.aggregateId, 'APPOINTMENT_STATUS_CHANGED');
        if (!link) return;

        if (newStatus === AppointmentStatus.CLOSED) {
            const closeCategory: string = event.data?.closeCategory ?? 'resolved';
            const closeNotes: string | undefined = event.data?.comment;

            const result = await this.snService.closeTicket(link, closeCategory, closeNotes);

            if (result.isFailure) {
                const msg = `[APPOINTMENT_STATUS_CHANGED] Failed to close SN ticket for appointment ${event.aggregateId}: ${result.unwrapError().message}`;
                this.logger.error(msg);
                throw new Error(msg);
            }

            link.close();
            const updateResult = await this.ticketLinkRepo.update(link);
            if (updateResult.isFailure) {
                const msg = `[APPOINTMENT_STATUS_CHANGED] SN ticket closed but failed to persist link ${link.id} for appointment ${event.aggregateId}: ${updateResult.unwrapError().message}`;
                this.logger.error(msg);
                throw new Error(msg);
            }

            this.logger.log(`[APPOINTMENT_STATUS_CHANGED] SN ticket closed for appointment ${event.aggregateId} — sysId: ${link.sysId?.value}`);
            return;
        }

        // Resto de las transiciones (IN_PROGRESS, PENDING_*, CANCELED) — quedan
        // como auditoría en el ticket (work_notes) para poder consultarlas desde SN.
        const snState = APPOINTMENT_STATUS_TO_SN_STATE[newStatus];
        if (!snState) {
            this.logger.debug(`[APPOINTMENT_STATUS_CHANGED] Sin mapeo SN para newStatus=${newStatus} — solo se registra en el timeline interno`);
            return;
        }
        if (!link.sysId) {
            this.logger.debug(`[APPOINTMENT_STATUS_CHANGED] Link ${link.id} sin sysId todavía (modo diferido) — se saltea la sincronización de estado`);
            return;
        }

        const comment: string | undefined = event.data?.comment;
        const result = await this.snService.updateTicket(link.type, link.sysId.value, {
            state: snState,
            work_notes: comment ?? `Estado actualizado a ${newStatus} desde Event Corner`,
        });

        // No-bloqueante a propósito — ver comentario análogo en la versión Incident-only.
        if (result.isFailure) {
            this.logger.error(
                `[APPOINTMENT_STATUS_CHANGED] Failed to sync SN ticket (newStatus=${newStatus}) for appointment ${event.aggregateId}: ${result.unwrapError().message}`,
            );
            return;
        }

        this.logger.log(`[APPOINTMENT_STATUS_CHANGED] SN ticket updated for appointment ${event.aggregateId} — sysId: ${link.sysId.value} | state: ${snState}`);
    }

    private async handleDelivered(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.appointmentDelivered',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleDelivered(event),
        );
    }

    private async _handleDelivered(event: DomainEvent): Promise<void> {
        const link = await this.loadPrimaryLink(event.aggregateId, 'APPOINTMENT_DELIVERED');
        if (!link || !link.sysId) return;

        const result = await this.snService.updateTicket(link.type, link.sysId.value, {
            work_notes: 'Dispositivo entregado por el cliente en el corner',
        });

        if (result.isFailure) {
            this.logger.error(
                `[APPOINTMENT_DELIVERED] Failed to sync SN ticket for appointment ${event.aggregateId}: ${result.unwrapError().message}`,
            );
            return;
        }

        this.logger.log(`[APPOINTMENT_DELIVERED] SN ticket updated for appointment ${event.aggregateId} — sysId: ${link.sysId.value}`);
    }

    private async handleValidated(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.appointmentValidated',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleValidated(event),
        );
    }

    private async _handleValidated(event: DomainEvent): Promise<void> {
        const link = await this.loadPrimaryLink(event.aggregateId, 'APPOINTMENT_VALIDATED');
        if (!link || !link.sysId) return;

        const result = await this.snService.updateTicket(link.type, link.sysId.value, {
            work_notes: 'Resolución validada por el cliente',
        });

        if (result.isFailure) {
            this.logger.error(
                `[APPOINTMENT_VALIDATED] Failed to sync SN ticket for appointment ${event.aggregateId}: ${result.unwrapError().message}`,
            );
            return;
        }

        this.logger.log(`[APPOINTMENT_VALIDATED] SN ticket updated for appointment ${event.aggregateId} — sysId: ${link.sysId.value}`);
    }

    private async handleReopened(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.appointmentReopened',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleReopened(event),
        );
    }

    private async _handleReopened(event: DomainEvent): Promise<void> {
        const link = await this.loadPrimaryLink(event.aggregateId, 'APPOINTMENT_REOPENED');
        if (!link || !link.sysId) return;

        // SN state 2 = In Progress (reopened)
        const result = await this.snService.updateTicket(link.type, link.sysId.value, {
            state: '2',
            work_notes: event.data?.reason ?? 'Reabierto desde Event Corner',
        });

        if (result.isFailure) {
            const msg = `[APPOINTMENT_REOPENED] Failed to reopen SN ticket for appointment ${event.aggregateId}: ${result.unwrapError().message}`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        this.logger.log(`[APPOINTMENT_REOPENED] SN ticket reopened for appointment ${event.aggregateId} — sysId: ${link.sysId.value}`);
    }

    /** Carga el appointment y devuelve su ticket link 'primary' no abandonado, o null si no aplica (sin log ruidoso si simplemente no hay ticket todavía). */
    private async loadPrimaryLink(aggregateId: string, context: string): Promise<ServiceNowTicketLink | null> {
        const appointmentResult = await this.appointmentRepo.findById(aggregateId as AppointmentId);
        if (appointmentResult.isFailure) {
            this.logger.error(`[${context}] Could not load appointment ${aggregateId}: ${appointmentResult.unwrapError().message}`);
            return null;
        }
        if (!appointmentResult.unwrap()) {
            this.logger.warn(`[${context}] Appointment ${aggregateId} not found`);
            return null;
        }

        const linksResult = await this.ticketLinkRepo.findByAppointmentId(aggregateId as AppointmentId);
        if (linksResult.isFailure) {
            this.logger.error(`[${context}] Could not load ticket links for appointment ${aggregateId}: ${linksResult.unwrapError().message}`);
            return null;
        }

        const primary = linksResult.unwrap().find((l) => l.role === 'primary' && l.status !== 'ABANDONED');
        if (!primary) {
            this.logger.warn(`[${context}] Appointment ${aggregateId} has no SN ticket — skipping sync`);
            return null;
        }
        return primary;
    }
}
