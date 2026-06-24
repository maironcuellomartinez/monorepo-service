import { Injectable, Logger, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { IIntegrationEventRepository } from '../../domain/interfaces/repository.interface';

@Injectable()
export class StuckEventRecoveryJob {
    private readonly logger = new Logger(StuckEventRecoveryJob.name);
    private readonly STUCK_THRESHOLD_MINUTES = 10;

    constructor(
        @Inject('IIntegrationEventRepository')
        private readonly integrationEventRepository: IIntegrationEventRepository,
    ) { }

    @Interval(300000) // cada 5 minutos
    async recoverStuckEvents(): Promise<void> {
        try {
            const stuckEvents = await this.integrationEventRepository.findStuckProcessing(
                this.STUCK_THRESHOLD_MINUTES,
            );

            if (stuckEvents.length === 0) return;

            this.logger.warn(`Recovering ${stuckEvents.length} stuck PROCESSING events`, {
                eventIds: stuckEvents.map(e => e.id),
            });

            for (const event of stuckEvents) {
                event.markAsFailed('Stuck in PROCESSING — recovered by job');
                await this.integrationEventRepository.update(event);
            }
        } catch (error) {
            this.logger.error('Stuck event recovery job failed', { error: error.message });
        }
    }
}
