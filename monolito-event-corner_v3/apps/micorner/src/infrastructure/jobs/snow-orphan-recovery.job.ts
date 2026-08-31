// infrastructure/jobs/snow-orphan-recovery.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { IAppointmentRepository } from '../../core/ports/outgoing/repositories/appointment-repository.port';
import { ITicketLinkRepository } from '../../core/ports/outgoing/repositories/servicenow-ticket-link-repository.port';
import { IUserRepository } from '../../core/ports/outgoing/repositories/user-repository.port';
import { ICompanyRepository } from '../../core/ports/outgoing/repositories/company-repository.port';
import { ServiceNowIntegrationService } from '../../core/services/servicenow/servicenow-integration.service';
import {
  APPOINTMENT_REPOSITORY,
  SERVICENOW_TICKET_LINK_REPOSITORY,
  USER_REPOSITORY,
  COMPANY_REPOSITORY,
} from '../../core/ports/outgoing/repositories/tokens';
import { SERVICENOW_INTEGRATION_SERVICE } from '../../core/ports/incoming/service-tokens';
import { AppointmentKind } from '../../core/domain/enums/appointment-kind.enum';
import { ServiceNowTicketLink } from '../../core/domain/entities/servicenow-ticket-link.entity';

/**
 * Job de recuperación para citas huérfanas en ServiceNow.
 *
 * Una cita se considera huérfana cuando no tiene ningún ServiceNowTicketLink
 * PENDING/ACTIVE (ninguno, o todos ABANDONED/CLOSED), está en un estado no
 * terminal, y fue creada hace más de MIN_AGE_MINUTES minutos. Generaliza lo
 * que antes era Incident-only (findOrphanedSnowIncidents) a cualquier kind —
 * las citas REQUEST ganan recuperación de huérfanos por primera vez.
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
        @Inject(APPOINTMENT_REPOSITORY) private readonly appointmentRepo: IAppointmentRepository,
        @Inject(SERVICENOW_TICKET_LINK_REPOSITORY) private readonly ticketLinkRepo: ITicketLinkRepository,
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

        this.logger.log(`SnowOrphanRecoveryJob: buscando citas huérfanas (minAge=${this.minAgeMinutes}m)`);

        const result = await this.appointmentRepo.findOrphanedTicketAppointments(this.minAgeMinutes);
        if (result.isFailure) {
            this.logger.error(`SnowOrphanRecoveryJob: error buscando huérfanas — ${result.unwrapError().message}`);
            return;
        }

        const orphans = result.unwrap();
        if (orphans.length === 0) {
            this.logger.debug('SnowOrphanRecoveryJob: sin citas huérfanas');
            return;
        }

        this.logger.warn(`SnowOrphanRecoveryJob: encontradas ${orphans.length} cita(s) huérfana(s) — re-encolando en snowq`);

        for (const appointment of orphans) {
            try {
                const userResult = await this.userRepo.findById(appointment.customerId);
                if (userResult.isFailure || !userResult.unwrap()) {
                    this.logger.warn(`SnowOrphanRecoveryJob: appointment=${appointment.id} — usuario ${appointment.customerId} no encontrado, saltando`);
                    continue;
                }
                const user = userResult.unwrap()!;

                const companyId = appointment.companyId ?? user.companyId;
                if (!companyId) {
                    this.logger.warn(`SnowOrphanRecoveryJob: appointment=${appointment.id} — sin empresa, saltando`);
                    continue;
                }

                const companyResult = await this.companyRepo.findById(companyId);
                if (companyResult.isFailure || !companyResult.unwrap()) {
                    this.logger.warn(`SnowOrphanRecoveryJob: appointment=${appointment.id} — empresa ${companyId} no encontrada, saltando`);
                    continue;
                }
                const company = companyResult.unwrap()!;

                const ticketType = appointment.kind === AppointmentKind.ISSUE ? 'incident' : 'sc_req_item';
                const linkResult = ServiceNowTicketLink.createPending(
                    crypto.randomUUID(),
                    appointment.id,
                    ticketType,
                    'primary',
                );
                if (linkResult.isFailure) {
                    this.logger.error(`SnowOrphanRecoveryJob: appointment=${appointment.id} — no se pudo crear el link: ${linkResult.unwrapError().message}`);
                    continue;
                }
                const link = linkResult.unwrap();

                // Persistir el link PENDING ANTES de encolar en snowq — no al
                // revés. findOrphanedTicketAppointments excluye citas con un
                // link PENDING/ACTIVE, así que guardarlo primero es lo que
                // evita que el próximo ciclo la vuelva a tomar como huérfana
                // mientras el ticket ya está en camino. Con el orden
                // anterior (encolar y recién ahí guardar), un fallo al
                // persistir dejaba un ticket real creándose en ServiceNow
                // sin ningún rastro acá — la cita seguía huérfana y el
                // siguiente ciclo generaba OTRO ticket duplicado para la
                // misma cita, indefinidamente (ver M-02 en la auditoría de
                // 2026-08-31).
                const savePendingResult = await this.ticketLinkRepo.save(link);
                if (savePendingResult.isFailure) {
                    this.logger.error(`SnowOrphanRecoveryJob: appointment=${appointment.id} — error persistiendo el link: ${savePendingResult.unwrapError().message}`);
                    continue;
                }

                // Re-encolar en snowq (async only) — el ReconcilerJob obtendrá sysId+number.
                const enqueueResult = await this.snService.reQueueTicket(appointment, link, company);
                if (enqueueResult.isFailure) {
                    this.logger.error(`SnowOrphanRecoveryJob: appointment=${appointment.id} — snowq no disponible: ${enqueueResult.unwrapError().message}`);
                    link.abandon();
                    const abandonResult = await this.ticketLinkRepo.save(link);
                    if (abandonResult.isFailure) {
                        this.logger.error(`SnowOrphanRecoveryJob: appointment=${appointment.id} — no se pudo abandonar el link tras fallo de encolado: ${abandonResult.unwrapError().message}`);
                    }
                    continue;
                }

                // reQueueTicket mutó `link` con el correlationId (markDeferred) — persistir el estado final.
                const saveResult = await this.ticketLinkRepo.save(link);
                if (saveResult.isFailure) {
                    this.logger.error(`SnowOrphanRecoveryJob: appointment=${appointment.id} — error persistiendo correlationId del link: ${saveResult.unwrapError().message}`);
                    continue;
                }

                this.logger.log(`SnowOrphanRecoveryJob: appointment=${appointment.id} — re-encolado en snowq, correlationId=${link.snowqCorrelationId}`);
            } catch (err: unknown) {
                this.logger.error(`SnowOrphanRecoveryJob: appointment=${appointment.id} — excepción inesperada: ${(err as Error)?.message ?? String(err)}`);
            }
        }
    }
}
