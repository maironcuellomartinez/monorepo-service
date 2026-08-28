// infrastructure/jobs/slot-hold-cleanup.job.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ISlotRepository } from '../../core/ports/outgoing/repositories/slot-repository.port';
import { SLOT_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';

/**
 * Limpieza diaria de slots:
 *  - Holds expirados → AVAILABLE. La expiración lazy es el mecanismo principal
 *    (los queries tratan HELD expirados como AVAILABLE); este barrido físico
 *    mantiene el índice eficiente.
 *  - Slots AVAILABLE cuyo horario ya pasó → EXPIRED. La lectura de
 *    disponibilidad ya los filtra por fecha; esto materializa el estado para
 *    que las filas viejas no queden AVAILABLE indefinidamente.
 */
@Injectable()
export class SlotHoldCleanupJob {
  private readonly logger = new Logger(SlotHoldCleanupJob.name);

  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slotRepo: ISlotRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanup(): Promise<void> {
    const holdsResult = await this.slotRepo.releaseExpiredHolds(1);
    if (holdsResult.isFailure) {
      this.logger.error(
        'SlotHoldCleanupJob: error al limpiar holds',
        holdsResult.unwrapError().message,
      );
    } else if (holdsResult.unwrap() > 0) {
      this.logger.log(
        `SlotHoldCleanupJob: ${holdsResult.unwrap()} holds expirados liberados`,
      );
    }

    const expiredResult = await this.slotRepo.markAsExpired(new Date());
    if (expiredResult.isFailure) {
      this.logger.error(
        'SlotHoldCleanupJob: error al expirar slots pasados',
        expiredResult.unwrapError().message,
      );
    } else if (expiredResult.unwrap() > 0) {
      this.logger.log(
        `SlotHoldCleanupJob: ${expiredResult.unwrap()} slots pasados marcados EXPIRED`,
      );
    }
  }
}
