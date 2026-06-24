// infrastructure/jobs/snow-orphan-recovery.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { IIncidentRepository } from '../../core/ports/outgoing/repositories/incident-repository.port';
import { IUserRepository } from '../../core/ports/outgoing/repositories/user-repository.port';
import { ICompanyRepository } from '../../core/ports/outgoing/repositories/company-repository.port';
import { ServiceNowIntegrationService } from '../../core/services/servicenow/servicenow-integration.service';
import { INCIDENT_REPOSITORY, USER_REPOSITORY, COMPANY_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '../../core/ports/incoming/service-tokens';

/**
 * Job de recuperación para incidencias huérfanas en ServiceNow.
 *
 * Una incidencia se considera huérfana cuando:
 *  - No tiene servicenow_id (el ticket no fue registrado en SN)
 *  - No tiene snowq_correlation_id (no hay operación async pendiente)
 *  - Está en un estado no terminal (CREATED, DELIVERED, IN_PROGRESS, etc.)
 *  - Fue creada hace más de MIN_AGE_MINUTES minutos (evita colisionar con el
 *    flujo normal de creación que tarda algunos segundos)
 *
 * Causas habituales de incidencias huérfanas:
 *  1. SN/snowq estaba caído cuando se creó la incidencia y el OutboxWorker
 *     agotó sus 3 reintentos (~35 s).
 *  2. El ReconcilerJob recibió status FAILED de snowq y limpió el correlationId
 *     sin haber registrado el ticket.
 *  3. Bugs previos (ej. cast inseguro de ServiceNowId) que persistieron null.
 *
 * Variables de entorno:
 *   SNOW_ORPHAN_RECOVERY_ENABLED   'true' para activar (default: false en dev)
 *   SNOW_ORPHAN_RECOVERY_INTERVAL  Intervalo en segundos (default: 600 = 10 min)
 *   SNOW_ORPHAN_MIN_AGE_MINUTES    Edad mínima en minutos (default: 10)
 */
@Injectable()
export class SnowOrphanRecoveryJob {
    private readonly logger = new Logger(SnowOrphanRecoveryJob.name);

    private readonly enabled: boolean;
    private readonly minAgeMinutes: number;

    constructor(
        @Inject(INCIDENT_REPOSITORY) private readonly incidentRepo: IIncidentRepository,
        @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
        @Inject(COMPANY_REPOSITORY) private readonly companyRepo: ICompanyRepository,
        @Inject(SERVICENOW_INTEGRATION_SERVICE) private readonly snService: ServiceNowIntegrationService,
    ) {
        this.enabled = process.env.SNOW_ORPHAN_RECOVERY_ENABLED === 'true';
        this.minAgeMinutes = parseInt(process.env.SNOW_ORPHAN_MIN_AGE_MINUTES ?? '10', 10);
    }

    @Interval(parseInt(process.env.SNOW_ORPHAN_RECOVERY_INTERVAL ?? '600', 10) * 1_000)
    async recover(): Promise<void> {
        if (!this.enabled) {
            this.logger.debug('SnowOrphanRecoveryJob: desactivado (SNOW_ORPHAN_RECOVERY_ENABLED != true)');
            return;
        }

        this.logger.log(`SnowOrphanRecoveryJob: buscando incidencias huérfanas (minAge=${this.minAgeMinutes}m)`);

        const result = await this.incidentRepo.findOrphanedSnowIncidents(this.minAgeMinutes);
        if (result.isFailure) {
            this.logger.error(`SnowOrphanRecoveryJob: error buscando huérfanas — ${result.unwrapError().message}`);
            return;
        }

        const orphans = result.unwrap();
        if (orphans.length === 0) {
            this.logger.debug('SnowOrphanRecoveryJob: sin incidencias huérfanas');
            return;
        }

        this.logger.warn(`SnowOrphanRecoveryJob: encontradas ${orphans.length} incidencia(s) huérfana(s) — re-encolando en snowq`);

        for (const incident of orphans) {
            try {
                // Resolver empresa del cliente
                const userResult = await this.userRepo.findById(incident.customerId);
                if (userResult.isFailure || !userResult.unwrap()) {
                    this.logger.warn(`SnowOrphanRecoveryJob: incident=${incident.id} — usuario ${incident.customerId} no encontrado, saltando`);
                    continue;
                }
                const user = userResult.unwrap()!;

                if (!user.companyId) {
                    this.logger.warn(`SnowOrphanRecoveryJob: incident=${incident.id} — usuario sin empresa, saltando`);
                    continue;
                }

                const companyResult = await this.companyRepo.findById(user.companyId);
                if (companyResult.isFailure || !companyResult.unwrap()) {
                    this.logger.warn(`SnowOrphanRecoveryJob: incident=${incident.id} — empresa ${user.companyId} no encontrada, saltando`);
                    continue;
                }
                const company = companyResult.unwrap()!;

                // Re-encolar en snowq (async only) — el ReconcilerJob obtendrá sysId+number
                // No se fuerza creación inmediata para evitar tickets duplicados si SN
                // ya procesó la solicitud previa pero snowq perdió la respuesta.
                const enqueueResult = await this.snService.reQueueIncidentTicket(incident, company);
                if (enqueueResult.isFailure) {
                    this.logger.error(`SnowOrphanRecoveryJob: incident=${incident.id} — snowq no disponible: ${enqueueResult.unwrapError().message}`);
                    continue;
                }

                // Persistir el nuevo snowq_correlation_id
                const updateResult = await this.incidentRepo.update(incident);
                if (updateResult.isFailure) {
                    this.logger.error(`SnowOrphanRecoveryJob: incident=${incident.id} — error persistiendo correlationId: ${updateResult.unwrapError().message}`);
                    continue;
                }

                this.logger.log(`SnowOrphanRecoveryJob: incident=${incident.id} — re-encolado en snowq, correlationId=${incident.snowqCorrelationId}`);
            } catch (err: unknown) {
                this.logger.error(`SnowOrphanRecoveryJob: incident=${incident.id} — excepción inesperada: ${(err as Error)?.message ?? String(err)}`);
            }
        }
    }
}
