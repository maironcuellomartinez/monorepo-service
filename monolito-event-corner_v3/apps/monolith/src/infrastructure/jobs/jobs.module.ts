// infrastructure/jobs/jobs.module.ts
import { Global, Module } from '@nestjs/common';
import { SnCompanySyncJob } from './sn-company-sync.job';

/**
 * Jobs que además necesitan ser invocables fuera del cron (ej. desde un
 * controller) van acá, como providers globales. Los que solo corren por
 * @Cron y nunca se inyectan en otro lado (MonolithReconcilerJob,
 * SnowOrphanRecoveryJob, etc.) siguen registrados directo en MonolithModule.
 */
@Global()
@Module({
    providers: [SnCompanySyncJob],
    exports: [SnCompanySyncJob],
})
export class JobsModule { }
