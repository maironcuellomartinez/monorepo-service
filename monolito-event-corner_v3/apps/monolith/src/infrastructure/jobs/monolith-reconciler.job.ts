// infrastructure/jobs/monolith-reconciler.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CorrelationIdService, TracingService } from '@app/observability';
import { IIncidentRepository } from '../../core/ports/outgoing/repositories/incident-repository.port';
import { IRequestRepository } from '../../core/ports/outgoing/repositories/request-repository.port';
import { IServiceNowClient, SnowqStatusResult } from '../../core/ports/outgoing/servicenow/servicenow-client.port';
import { INCIDENT_REPOSITORY, REQUEST_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';
import { SERVICENOW_CLIENT } from '../../core/ports/outgoing/infrastructure-tokens';
import { ServiceNowId } from '../../core/domain/value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../../core/domain/value-objects/servicenow-number.value';
import { ServiceNowIntegrationService } from '../../core/services/servicenow/servicenow-integration.service';
import { SERVICENOW_INTEGRATION_SERVICE } from '../../core/ports/incoming/service-tokens';
import { IncidentStatus } from '../../core/domain/enums/incident-status.enum';

const RECONCILE_INTERVAL_MS = 30_000;

/**
 * Job que reconcilia tickets encolados en modo async (api-snowq-service).
 *
 * Cada 30 s consulta el estado de los correlationIds pendientes.
 * Cuando el estado es DELIVERED, actualiza servicenow_id / servicenow_number
 * en el agregado de dominio y limpia el snowq_correlation_id.
 * Cuando el estado es FAILED, descarta el correlationId (log de error).
 *
 * Variable de entorno:
 *   API_GATEWAY_URL   Base URL del gateway (reconcile va por /outbound/servicenow/reconcile/*)
 */
@Injectable()
export class MonolithReconcilerJob {
    private readonly logger = new Logger(MonolithReconcilerJob.name);

    constructor(
        @Inject(INCIDENT_REPOSITORY) private readonly incidentRepo: IIncidentRepository,
        @Inject(REQUEST_REPOSITORY) private readonly requestRepo: IRequestRepository,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly snService: ServiceNowIntegrationService,
        @Inject(SERVICENOW_CLIENT) private readonly snClient: IServiceNowClient,
        private readonly correlation: CorrelationIdService,
        private readonly tracing: TracingService,
    ) { }

    @Interval(RECONCILE_INTERVAL_MS)
    async reconcile(): Promise<void> {
        return this.tracing.run(
            'monolith.job.reconciler',
            { kind: 'internal' },
            () => this._reconcile(),
        );
    }

    private async _reconcile(): Promise<void> {
        this.logger.debug('ReconcilerJob: iniciando ciclo de reconciliación');
        await Promise.all([
            this.reconcileIncidents(),
            this.reconcileRequests(),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────

    private async reconcileIncidents(): Promise<void> {
        const result = await this.incidentRepo.findPendingSnowqReconciliation();
        if (result.isFailure) {
            this.logger.error(`ReconcilerJob: failed to fetch pending incidents: ${result.unwrapError().message}`);
            return;
        }

        const incidents = result.unwrap();
        if (incidents.length === 0) {
            this.logger.debug('ReconcilerJob: sin incidents pendientes de reconciliación');
            return;
        }
        this.logger.log(`ReconcilerJob: reconciliando ${incidents.length} incident(s) pendiente(s)`);

        for (const incident of incidents) {
            const correlationId = incident.snowqCorrelationId!;
            await this.correlation.run(
                async () => {
                    const status = await this.querySnowq(correlationId);
                    if (!status) return;

                    if (status.status === 'DELIVERED' && status.sysId && status.snowNumber) {
                        const sysIdResult = ServiceNowId.create(status.sysId);
                        const numResult = ServiceNowNumber.create(status.snowNumber);
                        if (sysIdResult.isFailure || numResult.isFailure) return;

                        incident.updateServiceNowInfo(sysIdResult.unwrap(), numResult.unwrap());
                        incident.setSnowqCorrelationId(null);

                        const updateResult = await this.incidentRepo.update(incident);
                        if (updateResult.isFailure) {
                            this.logger.error(`ReconcilerJob: failed to update incident ${incident.id}: ${updateResult.unwrapError().message}`);
                            return;
                        }

                        this.logger.log(`ReconcilerJob: reconciled incident ${incident.id} → ${status.snowNumber} (${status.sysId})`);

                        // Si el incidente ya fue cerrado mientras SN estaba en modo deferred,
                        // cerrar el ticket ahora que tenemos el sysId
                        if (incident.status === IncidentStatus.CLOSED) {
                            const closeResult = await this.snService.closeIncidentTicket(status.sysId, 'resolved', 'Cerrado en modo diferido — reconciliado por ReconcilerJob');
                            if (closeResult.isFailure) {
                                this.logger.error(`ReconcilerJob: failed to close deferred incident ${incident.id} in SN: ${closeResult.unwrapError().message}`);
                            } else {
                                this.logger.log(`ReconcilerJob: deferred close applied for incident ${incident.id} → sysId: ${status.sysId}`);
                            }
                        }
                    } else if (status.status === 'FAILED') {
                        if (this.isFatalError(status.lastError)) {
                            // Error fatal (auth, 401/403): reintentar no sirve — alertar y limpiar.
                            this.logger.error(
                                `ReconcilerJob: incident ${incident.id} | correlationId ${correlationId} FAILED con error FATAL — no se reintentará. lastError=${status.lastError}`,
                            );
                            incident.setSnowqCorrelationId(null);
                            await this.incidentRepo.update(incident);
                        } else {
                            // Error temporal (SN caído): snowq agotó sus reintentos internos.
                            // Resetear retryCount=0 en snowq → QUEUED. Mismo correlationId.
                            this.logger.warn(`ReconcilerJob: incident ${incident.id} | correlationId ${correlationId} FAILED (temporal) — reintentando en snowq`);
                            const retryResult = await this.snClient.retrySnowqEntry(correlationId);
                            if (retryResult.isFailure) {
                                // snowq no disponible: limpiamos para que el orphan job lo recupere.
                                this.logger.error(`ReconcilerJob: incident ${incident.id} — retry en snowq falló (${retryResult.unwrapError().message}), clearing correlationId`);
                                incident.setSnowqCorrelationId(null);
                                await this.incidentRepo.update(incident);
                            } else {
                                this.logger.log(`ReconcilerJob: incident ${incident.id} | correlationId ${correlationId} → re-encolado en snowq (QUEUED)`);
                            }
                        }
                    } else {
                        this.logger.debug(`ReconcilerJob: incident ${incident.id} | status=${status.status} — esperando próximo ciclo`);
                    }
                },
                { correlationId, labels: { job: 'reconciler', entityType: 'incident', incidentId: incident.id } },
            );
        }
    }

    private async reconcileRequests(): Promise<void> {
        const result = await this.requestRepo.findPendingSnowqReconciliation();
        if (result.isFailure) {
            this.logger.error(`ReconcilerJob: failed to fetch pending requests: ${result.unwrapError().message}`);
            return;
        }

        const requests = result.unwrap();
        if (requests.length === 0) {
            this.logger.debug('ReconcilerJob: sin requests pendientes de reconciliación');
            return;
        }
        this.logger.log(`ReconcilerJob: reconciliando ${requests.length} request(s) pendiente(s)`);

        for (const request of requests) {
            const correlationId = request.snowqCorrelationId!;
            await this.correlation.run(
                async () => {
                    const status = await this.querySnowq(correlationId);
                    if (!status) return;

                    if (status.status === 'DELIVERED' && status.sysId && status.snowNumber) {
                        const sysIdResult = ServiceNowId.create(status.sysId);
                        const numResult = ServiceNowNumber.create(status.snowNumber);
                        if (sysIdResult.isFailure || numResult.isFailure) return;

                        request.updateServiceNowInfo(sysIdResult.unwrap(), numResult.unwrap());
                        request.setSnowqCorrelationId(null);

                        const updateResult = await this.requestRepo.update(request);
                        if (updateResult.isFailure) {
                            this.logger.error(`ReconcilerJob: failed to update request ${request.id}: ${updateResult.unwrapError().message}`);
                        } else {
                            this.logger.log(`ReconcilerJob: reconciled request ${request.id} → ${status.snowNumber} (${status.sysId})`);
                        }
                    } else if (status.status === 'FAILED') {
                        if (this.isFatalError(status.lastError)) {
                            this.logger.error(
                                `ReconcilerJob: request ${request.id} | correlationId ${correlationId} FAILED con error FATAL — no se reintentará. lastError=${status.lastError}`,
                            );
                            request.setSnowqCorrelationId(null);
                            await this.requestRepo.update(request);
                        } else {
                            this.logger.warn(`ReconcilerJob: request ${request.id} | correlationId ${correlationId} FAILED (temporal) — reintentando en snowq`);
                            const retryResult = await this.snClient.retrySnowqEntry(correlationId);
                            if (retryResult.isFailure) {
                                this.logger.error(`ReconcilerJob: request ${request.id} — retry en snowq falló (${retryResult.unwrapError().message}), clearing correlationId`);
                                request.setSnowqCorrelationId(null);
                                await this.requestRepo.update(request);
                            } else {
                                this.logger.log(`ReconcilerJob: request ${request.id} | correlationId ${correlationId} → re-encolado en snowq (QUEUED)`);
                            }
                        }
                    } else {
                        this.logger.debug(`ReconcilerJob: request ${request.id} | status=${status.status} — esperando próximo ciclo`);
                    }
                },
                { correlationId, labels: { job: 'reconciler', entityType: 'request', requestId: request.id } },
            );
        }
    }

    /**
     * Determina si el lastError de snowq corresponde a un error fatal
     * (no tiene sentido reintentar: problema de autenticación o configuración).
     *
     * Errores fatales reconocidos: 401, 403, Unauthorized, Forbidden, invalid credentials.
     * Errores temporales: 5xx, timeout, connection refused, circuit breaker.
     */
    private isFatalError(lastError?: string | null): boolean {
        if (!lastError) return false;
        const lower = lastError.toLowerCase();
        return (
            lower.includes('401') ||
            lower.includes('403') ||
            lower.includes('unauthorized') ||
            lower.includes('forbidden') ||
            lower.includes('invalid credentials') ||
            lower.includes('authentication') ||
            lower.includes('invalid_grant')
        );
    }

    private async querySnowq(correlationId: string): Promise<SnowqStatusResult | null> {
        const result = await this.snClient.getReconcileStatus(correlationId);
        if (result.isFailure) {
            this.logger.warn(`ReconcilerJob: no se pudo consultar correlationId=${correlationId} — ${result.unwrapError().message}`);
            return null;
        }
        return result.unwrap();
    }
}
