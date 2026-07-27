// infrastructure/event-handlers/incident-status-changed.handler.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '@app/shared/domain-event';
import { TracingService } from '@app/observability';
import { IEventBus } from '@app/core/ports/outgoing/event-bus/event-bus.port';
import { IIncidentRepository } from '@app/core/ports/outgoing/repositories/incident-repository.port';
import { ServiceNowIntegrationService } from '@app/core/services/servicenow/servicenow-integration.service';
import { IN_MEMORY_EVENT_BUS } from '@app/core/ports/outgoing/infrastructure-tokens';
import { INCIDENT_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IncidentId } from '@app/shared/types/branded-ids';
import { IncidentStatus } from '@app/core/domain/enums/incident-status.enum';

/**
 * Estado SN (semántico, lo traduce servicenow-clone-backend/SN real) para cada
 * IncidentStatus intermedio. IMPORTANTE: nunca usar 'resolved'/'closed' acá —
 * SnowSyncJob auto-cierra la incidencia en el monolith si detecta SN en {6,7},
 * así que solo el cierre real (closeIncidentTicket, más abajo) puede usarlos.
 */
const INCIDENT_STATUS_TO_SN_STATE: Partial<Record<IncidentStatus, string>> = {
    [IncidentStatus.IN_PROGRESS]: 'in_progress',
    [IncidentStatus.PENDING_THIRD_PARTY]: 'on_hold',
    [IncidentStatus.PENDING_USER]: 'on_hold',
    [IncidentStatus.PENDING_SPARE_PART]: 'on_hold',
    [IncidentStatus.PENDING_PICKUP]: 'on_hold',
    [IncidentStatus.PENDING_REPLACEMENT_DELIVERY]: 'on_hold',
    [IncidentStatus.CANCELED]: 'canceled',
};

@Injectable()
export class IncidentStatusChangedHandler implements OnModuleInit {
    private readonly logger = new Logger(IncidentStatusChangedHandler.name);

    constructor(
        @Inject(IN_MEMORY_EVENT_BUS) private readonly eventBus: IEventBus,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly snService: ServiceNowIntegrationService,
        @Inject(INCIDENT_REPOSITORY) private readonly incidentRepo: IIncidentRepository,
        private readonly tracing: TracingService,
    ) { }

    onModuleInit(): void {
        this.eventBus.subscribe('INCIDENT_STATUS_CHANGED', (event) => this.handleStatusChanged(event));
        this.eventBus.subscribe('INCIDENT_REOPENED', (event) => this.handleReopened(event));
        this.eventBus.subscribe('INCIDENT_DELIVERED', (event) => this.handleDelivered(event));
        this.eventBus.subscribe('INCIDENT_VALIDATED', (event) => this.handleValidated(event));
    }

    private async handleStatusChanged(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.incidentStatusChanged',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleStatusChanged(event),
        );
    }

    private async _handleStatusChanged(event: DomainEvent): Promise<void> {
        const newStatus: IncidentStatus = event.data?.newStatus;

        const incident = await this.loadIncident(event.aggregateId, 'INCIDENT_STATUS_CHANGED');
        if (!incident) return;

        // Idempotency: if the ticket was never created in SN there is nothing to sync
        if (!incident.servicenowId) {
            this.logger.warn(`[INCIDENT_STATUS_CHANGED] Incident ${event.aggregateId} has no SN ticket — skipping sync`);
            return;
        }

        if (newStatus === IncidentStatus.CLOSED) {
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
            return;
        }

        // Resto de las transiciones (IN_PROGRESS, PENDING_*, CANCELED) — quedan
        // como auditoría en el ticket (work_notes) para poder consultarlas desde SN.
        const snState = INCIDENT_STATUS_TO_SN_STATE[newStatus];
        if (!snState) {
            this.logger.debug(`[INCIDENT_STATUS_CHANGED] Sin mapeo SN para newStatus=${newStatus} — solo se registra en el timeline interno`);
            return;
        }

        const comment: string | undefined = event.data?.comment;
        const result = await this.snService.updateTicket('incident', incident.servicenowId.value, {
            state: snState,
            work_notes: comment ?? `Estado actualizado a ${newStatus} desde Event Corner`,
        });

        // No-bloqueante a propósito: publishMany() se awaitea de forma síncrona dentro
        // de _changeStatus() (incident.service.ts) — tirar acá haría fallar con 500 un
        // cambio de estado que YA se guardó en el monolith, por un problema puntual de SN.
        // Distinto de CLOSED (arriba), donde sí se propaga el error.
        if (result.isFailure) {
            this.logger.error(
                `[INCIDENT_STATUS_CHANGED] Failed to sync SN ticket (newStatus=${newStatus}) for incident ${event.aggregateId}: ${result.unwrapError().message}`,
            );
            return;
        }

        this.logger.log(`[INCIDENT_STATUS_CHANGED] SN ticket updated for incident ${event.aggregateId} — sysId: ${incident.servicenowId.value} | state: ${snState}`);
    }

    private async handleDelivered(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.incidentDelivered',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleDelivered(event),
        );
    }

    private async _handleDelivered(event: DomainEvent): Promise<void> {
        const incident = await this.loadIncident(event.aggregateId, 'INCIDENT_DELIVERED');
        if (!incident) return;

        if (!incident.servicenowId) {
            this.logger.warn(`[INCIDENT_DELIVERED] Incident ${event.aggregateId} has no SN ticket — skipping sync`);
            return;
        }

        // No cambia el state en SN (todavía no hay técnico trabajando) — solo
        // deja constancia de la entrega en el work_notes para auditoría.
        const result = await this.snService.updateTicket('incident', incident.servicenowId.value, {
            work_notes: 'Dispositivo entregado por el cliente en el corner',
        });

        // No-bloqueante — ver comentario en _handleStatusChanged.
        if (result.isFailure) {
            this.logger.error(
                `[INCIDENT_DELIVERED] Failed to sync SN ticket for incident ${event.aggregateId}: ${result.unwrapError().message}`,
            );
            return;
        }

        this.logger.log(`[INCIDENT_DELIVERED] SN ticket updated for incident ${event.aggregateId} — sysId: ${incident.servicenowId.value}`);
    }

    private async handleValidated(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.incidentValidated',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleValidated(event),
        );
    }

    private async _handleValidated(event: DomainEvent): Promise<void> {
        const incident = await this.loadIncident(event.aggregateId, 'INCIDENT_VALIDATED');
        if (!incident) return;

        if (!incident.servicenowId) {
            this.logger.warn(`[INCIDENT_VALIDATED] Incident ${event.aggregateId} has no SN ticket — skipping sync`);
            return;
        }

        // El ticket ya está resolved/closed en SN — solo se deja la constancia
        // de la validación del cliente en work_notes, sin tocar el state.
        const result = await this.snService.updateTicket('incident', incident.servicenowId.value, {
            work_notes: 'Resolución validada por el cliente',
        });

        // No-bloqueante — ver comentario en _handleStatusChanged.
        if (result.isFailure) {
            this.logger.error(
                `[INCIDENT_VALIDATED] Failed to sync SN ticket for incident ${event.aggregateId}: ${result.unwrapError().message}`,
            );
            return;
        }

        this.logger.log(`[INCIDENT_VALIDATED] SN ticket updated for incident ${event.aggregateId} — sysId: ${incident.servicenowId.value}`);
    }

    private async handleReopened(event: DomainEvent): Promise<void> {
        return this.tracing.run(
            'monolith.handler.incidentReopened',
            { kind: 'server', attributes: { 'handler.aggregateId': event.aggregateId } },
            () => this._handleReopened(event),
        );
    }

    private async _handleReopened(event: DomainEvent): Promise<void> {
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
