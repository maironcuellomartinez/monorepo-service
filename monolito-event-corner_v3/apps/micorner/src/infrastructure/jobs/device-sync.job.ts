// infrastructure/jobs/device-sync.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IDeviceService } from '../../core/ports/incoming/device/device-service.port';
import { DEVICE_SERVICE } from '../../core/ports/incoming/service-tokens';

@Injectable()
export class DeviceSyncJob {
    private readonly logger = new Logger(DeviceSyncJob.name);

    constructor(
        @Inject(DEVICE_SERVICE) private readonly deviceService: IDeviceService,
    ) {}

    /**
     * Cada 10 minutos:
     * 1. Consulta Minerva por cada usuario del micorner → upsert de dispositivos en DB
     * 2. Refresca los dispositivos en DB cuyo TTL (15 min) expiró
     */
    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleDeviceSync(): Promise<void> {
        this.logger.log('Starting device sync job...');

        // Fase 1: pull desde Minerva por usuario
        const syncResult = await this.deviceService.syncAllUsersDevices();
        if (syncResult.isFailure) {
            this.logger.error(`User device sync failed: ${syncResult.unwrapError().message}`);
        } else {
            const { usersProcessed, synced, errors } = syncResult.unwrap();
            this.logger.log(
                `User sync complete — users: ${usersProcessed}, synced: ${synced}, errors: ${errors}`,
            );
        }

        // Fase 2: refrescar stale devices ya en DB (respaldo para devices sin usuario activo)
        const staleResult = await this.deviceService.refreshStaleDevices();
        if (staleResult.isFailure) {
            this.logger.error(`Stale device refresh failed: ${staleResult.unwrapError().message}`);
            return;
        }

        const { refreshed, errors } = staleResult.unwrap();
        if (refreshed > 0 || errors > 0) {
            this.logger.log(`Stale refresh complete — refreshed: ${refreshed}, errors: ${errors}`);
        }
    }
}
