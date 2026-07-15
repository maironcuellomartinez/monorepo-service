// infrastructure/jobs/snow-sync.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TracingService } from '@app/observability';
import { IIncidentRepository } from '../../core/ports/outgoing/repositories/incident-repository.port';
import { IServiceNowClient } from '../../core/ports/outgoing/servicenow/servicenow-client.port';
import { IIncidentService } from '../../core/ports/incoming/incident/incident-service.port';
import { INCIDENT_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';
import { SERVICENOW_CLIENT } from '../../core/ports/outgoing/infrastructure-tokens';
import { INCIDENT_SERVICE } from '../../core/ports/incoming/service-tokens';

// SN state codes that mean "closed" in ServiceNow
const SN_CLOSED_STATES = new Set(['6', '7']); // 6=Resolved, 7=Closed
const SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Job that polls ServiceNow state for active incidents and closes them
 * in the monolith if they were closed directly in ServiceNow.
 *
 * Runs every 5 minutes. Only processes incidents that:
 * - Have a servicenow_id (linked to SN)
 * - Are currently in an active (non-terminal) state in monolith
 */
@Injectable()
export class SnowSyncJob {
  private readonly logger = new Logger(SnowSyncJob.name);

  constructor(
    @Inject(INCIDENT_REPOSITORY)
    private readonly incidentRepo: IIncidentRepository,
    @Inject(SERVICENOW_CLIENT) private readonly snClient: IServiceNowClient,
    @Inject(INCIDENT_SERVICE)
    private readonly incidentService: IIncidentService,
    private readonly tracing: TracingService,
  ) {}

  @Interval(SYNC_INTERVAL_MS)
  async sync(): Promise<void> {
    return this.tracing.run('monolith.job.snowSync', { kind: 'internal' }, () =>
      this._sync(),
    );
  }

  private async _sync(): Promise<void> {
    this.logger.debug(
      'SnowSyncJob: iniciando ciclo de sincronización SN → monolith',
    );

    const result = await this.incidentRepo.findActiveWithServiceNowId();
    if (result.isFailure) {
      this.logger.error(
        `SnowSyncJob: error obteniendo incidentes activos: ${result.unwrapError().message}`,
      );
      return;
    }

    const incidents = result.unwrap();
    if (incidents.length === 0) return;

    this.logger.log(
      `SnowSyncJob: verificando ${incidents.length} incidente(s) contra SN`,
    );

    for (const incident of incidents) {
      const sysId = incident.servicenowId?.value;
      if (!sysId) continue;

      const stateResult = await this.snClient.queryIncidentState(sysId);
      if (stateResult.isFailure) {
        this.logger.warn(
          `SnowSyncJob: no se pudo consultar SN para incident=${incident.id} sysId=${sysId}: ${stateResult.unwrapError().message}`,
        );
        continue;
      }

      const snState = stateResult.unwrap();
      if (!snState || !SN_CLOSED_STATES.has(snState)) continue;

      this.logger.log(
        `SnowSyncJob: incident=${incident.id} cerrado en SN (state=${snState}) — cerrando en monolith`,
      );

      const closeResult = await this.incidentService.closeFromExternalSync({
        incidentId: incident.id,
        comment: `Cerrado automáticamente por sincronización con ServiceNow (state=${snState})`,
      });

      if (closeResult.isFailure) {
        this.logger.error(
          `SnowSyncJob: no se pudo cerrar incident=${incident.id}: ${closeResult.unwrapError().message}`,
        );
      } else {
        this.logger.log(
          `SnowSyncJob: incident=${incident.id} cerrado exitosamente`,
        );
      }
    }
  }
}
