// infrastructure/jobs/sn-company-sync.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { TracingService } from '@app/observability';
import { IServiceNowProfileService } from '../../core/ports/incoming/servicenow/profile-service.port';
import { SERVICENOW_PROFILE_SERVICE } from '../../core/ports/incoming/service-tokens';

const DEFAULT_CRON = '0 2 * * *'; // 2 AM todos los días

interface SnCompany {
    sys_id: string;
    name: string;
}

export interface SnCompanySyncResult {
    synced: number;
    skipped: number;
    errors: number;
}

/**
 * Job que sincroniza perfiles de empresa desde servicenow-clone-backend al monolito.
 *
 * Por cada empresa activa en el catálogo de SN que aún no tenga un perfil
 * registrado (deduplicación por snowCompanySysId), crea el ServiceNowProfile.
 * Las compañías locales se gestionan manualmente por el administrador.
 *
 * Variables de entorno:
 *   SNOW_COMPANY_SYNC_ENABLED    'true' para activar (default: false)
 *   SNOW_COMPANY_SYNC_CRON       Expresión cron (default: '0 2 * * *' — 2 AM)
 *   SERVICENOW_SIMULATOR_URL     URL del servicenow-clone-backend (default: http://localhost:3010)
 */
@Injectable()
export class SnCompanySyncJob {
    private readonly logger = new Logger(SnCompanySyncJob.name);
    private readonly enabled: boolean;
    private readonly snCloneUrl: string;

    constructor(
        @Inject(SERVICENOW_PROFILE_SERVICE) private readonly profileService: IServiceNowProfileService,
        private readonly tracing: TracingService,
    ) {
        this.enabled = process.env.SNOW_COMPANY_SYNC_ENABLED === 'true';
        this.snCloneUrl = process.env.SERVICENOW_SIMULATOR_URL ?? 'http://localhost:3010';
    }

    @Cron(process.env.SNOW_COMPANY_SYNC_CRON ?? DEFAULT_CRON)
    async scheduledSync(): Promise<void> {
        if (!this.enabled) {
            this.logger.debug('SnCompanySyncJob: desactivado (SNOW_COMPANY_SYNC_ENABLED != true)');
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
        this.logger.log('SnCompanySyncJob: iniciando sincronización de empresas desde ServiceNow');

        let snCompanies: SnCompany[];
        try {
            const { data } = await axios.get<SnCompany[]>(`${this.snCloneUrl}/sn-companies`, { timeout: 5000 });
            snCompanies = data;
        } catch (err: any) {
            this.logger.error(`SnCompanySyncJob: no se pudo contactar servicenow-clone-backend — ${err?.message}`);
            return { synced: 0, skipped: 0, errors: 1 };
        }

        if (!snCompanies.length) {
            this.logger.log('SnCompanySyncJob: no hay empresas activas en el catálogo de SN');
            return { synced: 0, skipped: 0, errors: 0 };
        }

        const existingProfilesResult = await this.profileService.getAllProfiles();
        if (existingProfilesResult.isFailure) {
            this.logger.error(`SnCompanySyncJob: error obteniendo perfiles existentes — ${existingProfilesResult.unwrapError().message}`);
            return { synced: 0, skipped: 0, errors: 1 };
        }
        const existingSysIds = new Set(
            existingProfilesResult.unwrap().map((p) => p.snowCompanySysId.value),
        );

        let synced = 0;
        let skipped = 0;
        let errors = 0;

        for (const snCompany of snCompanies) {
            if (existingSysIds.has(snCompany.sys_id)) {
                skipped++;
                continue;
            }

            const profileResult = await this.profileService.createProfile({
                name: snCompany.name,
                snowCompanySysId: snCompany.sys_id as any,
                snowCompanyName: snCompany.name,
            });
            if (profileResult.isFailure) {
                this.logger.warn(`SnCompanySyncJob: error creando perfil para "${snCompany.name}" — ${profileResult.unwrapError().message}`);
                errors++;
                continue;
            }

            synced++;
            this.logger.log(`SnCompanySyncJob: perfil "${snCompany.name}" importado (sys_id=${snCompany.sys_id})`);
        }

        this.logger.log(`SnCompanySyncJob: completado — synced=${synced} skipped=${skipped} errors=${errors}`);
        return { synced, skipped, errors };
    }
}
