// infrastructure/jobs/sn-company-sync.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TracingService } from '@app/observability';
import { IServiceNowProfileService } from '../../core/ports/incoming/servicenow/profile-service.port';
import { SERVICENOW_PROFILE_SERVICE, COMPANY_SERVICE } from '../../core/ports/incoming/service-tokens';
import { ICompanyService } from '../../core/ports/incoming/company/company-service.port';
import { IServiceNowClient } from '../../core/ports/outgoing/servicenow/servicenow-client.port';
import { SERVICENOW_CLIENT } from '../../core/ports/outgoing/infrastructure-tokens';
import { ICompanyRepository } from '../../core/ports/outgoing/repositories/company-repository.port';
import { COMPANY_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';
import { ServiceNowProfileAlreadyExistsError } from '../../core/domain/errors/servicenow.errors';

const DEFAULT_CRON = '0 2 * * *'; // 2 AM todos los días

export interface SnCompanySyncResult {
  synced: number;
  skipped: number;
  errors: number;
  companiesCreated: number;
}

/**
 * Job que sincroniza perfiles de empresa desde ServiceNow al monolito.
 *
 * Por cada empresa activa en el catálogo de SN que aún no tenga un perfil
 * registrado (deduplicación por snowCompanySysId), crea el ServiceNowProfile.
 * Las compañías locales se gestionan manualmente por el administrador.
 *
 * El catálogo se obtiene vía api-gateway → api-snowq-service → ServiceNow
 * (único egress hacia SN del ecosistema, mismo patrón que el resto de la
 * integración) — no se contacta a ServiceNow directamente desde el monolito.
 *
 * Variables de entorno:
 *   SNOW_COMPANY_SYNC_ENABLED    'true' para activar (default: false)
 *   SNOW_COMPANY_SYNC_CRON       Expresión cron (default: '0 2 * * *' — 2 AM)
 */
@Injectable()
export class SnCompanySyncJob {
  private readonly logger = new Logger(SnCompanySyncJob.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(SERVICENOW_PROFILE_SERVICE)
    private readonly profileService: IServiceNowProfileService,
    @Inject(SERVICENOW_CLIENT) private readonly snClient: IServiceNowClient,
    @Inject(COMPANY_SERVICE) private readonly companyService: ICompanyService,
    @Inject(COMPANY_REPOSITORY) private readonly companyRepo: ICompanyRepository,
    private readonly tracing: TracingService,
  ) {
    this.enabled = process.env.SNOW_COMPANY_SYNC_ENABLED === 'true';
  }

  @Cron(process.env.SNOW_COMPANY_SYNC_CRON ?? DEFAULT_CRON)
  async scheduledSync(): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(
        'SnCompanySyncJob: desactivado (SNOW_COMPANY_SYNC_ENABLED != true)',
      );
      return;
    }
    await this.run();
  }

  async run(): Promise<SnCompanySyncResult> {
    return this.tracing.run(
      'monolith.job.snCompanySync',
      { kind: 'internal' },
      () => this._run(),
    );
  }

  private async _run(): Promise<SnCompanySyncResult> {
    this.logger.log(
      'SnCompanySyncJob: iniciando sincronización de empresas desde ServiceNow',
    );

    const companiesResult = await this.snClient.getCompanies();
    if (companiesResult.isFailure) {
      this.logger.error(
        `SnCompanySyncJob: no se pudo obtener el catálogo de empresas — ${companiesResult.unwrapError().message}`,
      );
      return { synced: 0, skipped: 0, errors: 1, companiesCreated: 0 };
    }
    const snCompanies = companiesResult.unwrap();

    if (!snCompanies.length) {
      this.logger.log(
        'SnCompanySyncJob: no hay empresas activas en el catálogo de SN',
      );
      return { synced: 0, skipped: 0, errors: 0, companiesCreated: 0 };
    }

    const existingProfilesResult = await this.profileService.getAllProfiles();
    if (existingProfilesResult.isFailure) {
      this.logger.error(
        `SnCompanySyncJob: error obteniendo perfiles existentes — ${existingProfilesResult.unwrapError().message}`,
      );
      return { synced: 0, skipped: 0, errors: 1, companiesCreated: 0 };
    }
    const existingProfiles = existingProfilesResult.unwrap();
    const existingProfileBySysId = new Map(
      existingProfiles.map((p) => [p.snowCompanySysId.value, p]),
    );

    let synced = 0;
    let skipped = 0;
    let errors = 0;
    let companiesCreated = 0;

    for (const snCompany of snCompanies) {
      let profile = existingProfileBySysId.get(snCompany.sys_id) ?? null;

      if (profile) {
        skipped++;
      } else {
        const profileResult = await this.profileService.createProfile({
          name: snCompany.name,
          snowCompanySysId: snCompany.sys_id as any,
          snowCompanyName: snCompany.name,
        });
        if (profileResult.isFailure) {
          const error = profileResult.unwrapError();
          // Otro proceso (sync manual o esta misma corrida en otra instancia)
          // ya creó el perfil entre el snapshot inicial y este insert — no es
          // un error real, es la constraint de BD atajando la carrera.
          if (error instanceof ServiceNowProfileAlreadyExistsError) {
            this.logger.debug(
              `SnCompanySyncJob: perfil para "${snCompany.name}" (sys_id=${snCompany.sys_id}) ya existía (creado concurrentemente)`,
            );
            skipped++;
            continue;
          }
          this.logger.warn(
            `SnCompanySyncJob: error creando perfil para "${snCompany.name}" — ${error.message}`,
          );
          errors++;
          continue;
        }

        profile = profileResult.unwrap();
        synced++;
        this.logger.log(
          `SnCompanySyncJob: perfil "${snCompany.name}" importado (sys_id=${snCompany.sys_id})`,
        );
      }

      // Asegura que exista una Company local vinculada al perfil — tanto para
      // perfiles recién creados como para los que ya existían antes de que
      // el sync empezara a generar compañías (backfill incremental).
      const existingCompanyResult = await this.companyRepo.findByProfileId(
        profile.id.toString(),
      );
      if (existingCompanyResult.isFailure) {
        this.logger.warn(
          `SnCompanySyncJob: error buscando compañía para el perfil "${profile.name}" — ${existingCompanyResult.unwrapError().message}`,
        );
        errors++;
        continue;
      }
      if (existingCompanyResult.unwrap()) continue;

      const companyResult = await this.companyService.createCompany({
        name: snCompany.name,
        profileId: profile.id.toString(),
        treeId: null,
      });
      if (companyResult.isFailure) {
        this.logger.warn(
          `SnCompanySyncJob: error creando compañía para "${snCompany.name}" — ${companyResult.unwrapError().message}`,
        );
        errors++;
        continue;
      }
      companiesCreated++;
      this.logger.log(
        `SnCompanySyncJob: compañía "${snCompany.name}" creada sin árbol asignado (profileId=${profile.id})`,
      );
    }

    this.logger.log(
      `SnCompanySyncJob: completado — synced=${synced} skipped=${skipped} errors=${errors} companiesCreated=${companiesCreated}`,
    );
    return { synced, skipped, errors, companiesCreated };
  }
}
