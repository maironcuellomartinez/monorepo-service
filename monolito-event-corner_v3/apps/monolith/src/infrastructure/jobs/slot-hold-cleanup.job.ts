// infrastructure/jobs/slot-hold-cleanup.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ISlotRepository } from '../../core/ports/outgoing/repositories/slot-repository.port';
import { SLOT_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';

/**
 * Limpieza diaria de holds expirados.
 * La expiración lazy es el mecanismo principal (los queries tratan HELD expirados
 * como AVAILABLE). Este job barre físicamente las filas para mantener el índice eficiente.
 */
@Injectable()
export class SlotHoldCleanupJob {
    private readonly logger = new Logger(SlotHoldCleanupJob.name);

    constructor(
        @Inject(SLOT_REPOSITORY) private readonly slotRepo: ISlotRepository,
    ) {}

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async cleanup(): Promise<void> {
        const result = await this.slotRepo.releaseExpiredHolds(1);
        if (result.isFailure) {
            this.logger.error('SlotHoldCleanupJob: error al limpiar holds', result.unwrapError().message);
            return;
        }
        const count = result.unwrap();
        if (count > 0) {
            this.logger.log(`SlotHoldCleanupJob: ${count} holds expirados liberados`);
        }
    }
}
