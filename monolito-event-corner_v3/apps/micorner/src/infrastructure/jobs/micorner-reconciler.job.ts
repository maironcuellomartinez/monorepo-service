// infrastructure/jobs/micorner-reconciler.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CorrelationIdService, TracingService } from '@app/observability';
import { IAppointmentRepository } from '../../core/ports/outgoing/repositories/appointment-repository.port';
import { ITicketLinkRepository } from '../../core/ports/outgoing/repositories/servicenow-ticket-link-repository.port';
import {
  IServiceNowClient,
  SnowqStatusResult,
} from '../../core/ports/outgoing/servicenow/servicenow-client.port';
import {
  APPOINTMENT_REPOSITORY,
  SERVICENOW_TICKET_LINK_REPOSITORY,
} from '../../core/ports/outgoing/repositories/tokens';
import { SERVICENOW_CLIENT } from '../../core/ports/outgoing/infrastructure-tokens';
import { ServiceNowId } from '../../core/domain/value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../../core/domain/value-objects/servicenow-number.value';
import { ServiceNowIntegrationService } from '../../core/services/servicenow/servicenow-integration.service';
import { SERVICENOW_INTEGRATION_SERVICE } from '../../core/ports/incoming/service-tokens';
import { AppointmentStatus } from '../../core/domain/enums/appointment-status.enum';

const RECONCILE_INTERVAL_MS = 30_000;

/**
 * Job que reconcilia tickets encolados en modo async (api-snowq-service).
 *
 * Cada 30 s consulta el estado de los correlationIds pendientes en
 * `servicenow_ticket_links` (cualquier tipo — incident/sc_req_item/sc_task).
 * DELIVERED → resuelve sysId/number en el link. FAILED fatal / correlationId
 * ya no existe en snowq → se abandona el link (status=ABANDONED, queda de
 * auditoría) para que SnowOrphanRecoveryJob cree uno nuevo — generaliza lo
 * que antes eran reconcileIncidents()/reconcileRequests() casi-duplicados.
 */
@Injectable()
export class MicornerReconcilerJob {
  private readonly logger = new Logger(MicornerReconcilerJob.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(SERVICENOW_TICKET_LINK_REPOSITORY)
    private readonly ticketLinkRepo: ITicketLinkRepository,
    @Inject(SERVICENOW_INTEGRATION_SERVICE)
    private readonly snService: ServiceNowIntegrationService,
    @Inject(SERVICENOW_CLIENT) private readonly snClient: IServiceNowClient,
    private readonly correlation: CorrelationIdService,
    private readonly tracing: TracingService,
  ) {}

  @Interval(RECONCILE_INTERVAL_MS)
  async reconcile(): Promise<void> {
    return this.tracing.run(
      'micorner.job.reconciler',
      { kind: 'internal' },
      () => this._reconcile(),
    );
  }

  private async _reconcile(): Promise<void> {
    this.logger.debug('ReconcilerJob: iniciando ciclo de reconciliación');
    await this.reconcileTicketLinks();
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async reconcileTicketLinks(): Promise<void> {
    const result = await this.ticketLinkRepo.findPendingSnowqReconciliation();
    if (result.isFailure) {
      this.logger.error(
        `ReconcilerJob: failed to fetch pending ticket links: ${result.unwrapError().message}`,
      );
      return;
    }

    const links = result.unwrap();
    if (links.length === 0) return;
    this.logger.log(
      `ReconcilerJob: reconciliando ${links.length} ticket link(s) pendiente(s)`,
    );

    for (const link of links) {
      const correlationId = link.snowqCorrelationId!;
      await this.correlation.run(
        async () => {
          const query = await this.querySnowq(correlationId);
          if (query.kind === 'transient_error') return; // reintenta próximo ciclo
          if (query.kind === 'not_found') {
            this.logger.warn(
              `ReconcilerJob: link ${link.id} (${link.type}) | correlationId ${correlationId} ya no existe en snowq — abandonando para recuperación por huérfanos`,
            );
            link.abandon();
            const abandonResult = await this.ticketLinkRepo.update(link);
            if (abandonResult.isFailure) {
              this.logger.error(
                `ReconcilerJob: failed to persist abandon for link ${link.id}: ${abandonResult.unwrapError().message}`,
              );
            }
            return;
          }
          const status = query.status;

          if (
            status.status === 'DELIVERED' &&
            status.sysId &&
            status.snowNumber
          ) {
            const sysIdResult = ServiceNowId.create(status.sysId);
            const numResult = ServiceNowNumber.create(status.snowNumber);
            if (sysIdResult.isFailure || numResult.isFailure) return;

            link.reconcileDelivered(sysIdResult.unwrap(), numResult.unwrap());
            const updateResult = await this.ticketLinkRepo.update(link);
            if (updateResult.isFailure) {
              this.logger.error(
                `ReconcilerJob: failed to update link ${link.id}: ${updateResult.unwrapError().message}`,
              );
              return;
            }

            this.logger.log(
              `ReconcilerJob: reconciled link ${link.id} (${link.type}) → ${status.snowNumber} (${status.sysId})`,
            );

            // Si la cita ya fue cerrada mientras SN estaba en modo deferred,
            // cerrar el ticket ahora que tenemos el sysId.
            const appointmentResult = await this.appointmentRepo.findById(link.appointmentId);
            const appointment = appointmentResult.isSuccess ? appointmentResult.unwrap() : null;
            if (appointment?.status === AppointmentStatus.CLOSED) {
              const closeResult = await this.snService.closeTicket(
                link,
                'resolved',
                'Cerrado en modo diferido — reconciliado por ReconcilerJob',
              );
              if (closeResult.isFailure) {
                this.logger.error(
                  `ReconcilerJob: failed to close deferred link ${link.id}: ${closeResult.unwrapError().message}`,
                );
              } else {
                this.logger.log(
                  `ReconcilerJob: deferred close applied for link ${link.id} → sysId: ${status.sysId}`,
                );
              }
            }
          } else if (status.status === 'FAILED') {
            if (this.isFatalError(status.lastError)) {
              this.logger.error(
                `ReconcilerJob: link ${link.id} (${link.type}) | correlationId ${correlationId} FAILED con error FATAL — no se reintentará. lastError=${status.lastError}`,
              );
              link.abandon();
              await this.ticketLinkRepo.update(link);
            } else {
              this.logger.warn(
                `ReconcilerJob: link ${link.id} (${link.type}) | correlationId ${correlationId} FAILED (temporal) — reintentando en snowq`,
              );
              const retryResult = await this.snClient.retrySnowqEntry(correlationId);
              if (retryResult.isFailure) {
                this.logger.error(
                  `ReconcilerJob: link ${link.id} — retry en snowq falló (${retryResult.unwrapError().message}), abandonando`,
                );
                link.abandon();
                await this.ticketLinkRepo.update(link);
              } else {
                this.logger.log(
                  `ReconcilerJob: link ${link.id} (${link.type}) | correlationId ${correlationId} → re-encolado en snowq (QUEUED)`,
                );
              }
            }
          } else {
            this.logger.debug(
              `ReconcilerJob: link ${link.id} (${link.type}) | status=${status.status} — esperando próximo ciclo`,
            );
          }
        },
        {
          correlationId,
          labels: {
            job: 'reconciler',
            entityType: link.type,
            appointmentId: link.appointmentId,
          },
        },
      );
    }
  }

  /**
   * Determina si el lastError de snowq corresponde a un error fatal
   * (no tiene sentido reintentar: problema de autenticación, configuración,
   * o payload inválido — reintentar el mismo payload malo agota los reintentos
   * en un loop indefinido, ver ServiceNowErrorFactory en api-snowq-service que
   * clasifica 400/404/422 como fatales del lado del cliente HTTP).
   */
  private isFatalError(lastError?: string | null): boolean {
    if (!lastError) return false;
    const lower = lastError.toLowerCase();
    return (
      lower.includes('400') ||
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('404') ||
      lower.includes('422') ||
      lower.includes('unauthorized') ||
      lower.includes('forbidden') ||
      lower.includes('invalid credentials') ||
      lower.includes('authentication') ||
      lower.includes('invalid_grant') ||
      lower.includes('bad request') ||
      lower.includes('validation')
    );
  }

  /**
   * Distingue "correlationId no existe en snowq" (404 real → not_found, señal
   * terminal) de "no se pudo consultar" (error de red/infra → transient_error,
   * reintentar el próximo ciclo).
   */
  private async querySnowq(
    correlationId: string,
  ): Promise<
    | { kind: 'ok'; status: SnowqStatusResult }
    | { kind: 'not_found' }
    | { kind: 'transient_error' }
  > {
    const result = await this.snClient.getReconcileStatus(correlationId);
    if (result.isFailure) {
      this.logger.warn(
        `ReconcilerJob: no se pudo consultar correlationId=${correlationId} (transitorio) — ${result.unwrapError().message}`,
      );
      return { kind: 'transient_error' };
    }
    const status = result.unwrap();
    if (status === null) {
      return { kind: 'not_found' };
    }
    return { kind: 'ok', status };
  }
}
