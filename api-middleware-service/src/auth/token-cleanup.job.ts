import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

@Injectable()
export class TokenCleanupJob {
    private readonly logger = new Logger(TokenCleanupJob.name);

    constructor(
        @InjectRepository(RefreshTokenEntity)
        private readonly refreshRepo: Repository<RefreshTokenEntity>,
    ) { }

    // Ejecuta a las 3am todos los dias
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async cleanupExpiredTokens(): Promise<void> {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // hace 24h

        // Elimina tokens expirados hace mas de 24h
        const expiredResult = await this.refreshRepo.delete({
            expiresAt: LessThan(cutoff),
        });

        // Elimina tokens revocados hace mas de 24h
        const revokedResult = await this.refreshRepo
            .createQueryBuilder()
            .delete()
            .where('revokedAt IS NOT NULL AND revokedAt < :cutoff', { cutoff })
            .execute();

        const total = (expiredResult.affected ?? 0) + (revokedResult.affected ?? 0);
        if (total > 0) {
            this.logger.log(`Token cleanup: ${total} filas eliminadas (${expiredResult.affected} expirados, ${revokedResult.affected} revocados)`);
        }
    }
}
