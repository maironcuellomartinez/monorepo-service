import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { SnowRequestEntity } from '../entities/snow-request.entity';
import { SnowRequestArchive } from '../entities/snow-request-archive.entity';
import { STATUS } from 'src/common';

const ARCHIVABLE_STATUSES = [STATUS.DELIVERED, STATUS.DISCARDED, STATUS.CANCELLED, STATUS.EXPIRED];
const ARCHIVE_BATCH_SIZE = 500;

@Injectable()
export class SnowRequestArchiveJob {
    private readonly logger = new Logger(SnowRequestArchiveJob.name);

    constructor(
        @InjectRepository(SnowRequestEntity)
        private readonly requestRepo: Repository<SnowRequestEntity>,
        @InjectRepository(SnowRequestArchive)
        private readonly archiveRepo: Repository<SnowRequestArchive>,
        private readonly dataSource: DataSource,
        private readonly configService: ConfigService,
    ) { }

    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async archiveOldRecords(): Promise<void> {
        const retentionDays = this.configService.get<number>('ARCHIVE_RETENTION_DAYS', 30);
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

        this.logger.log(`Iniciando archivado: registros terminales con updatedAt < ${cutoffDate.toISOString()} (retención: ${retentionDays} días)`);

        let totalArchived = 0;

        while (true) {
            const batch = await this.requestRepo.find({
                where: {
                    status: In(ARCHIVABLE_STATUSES),
                    updatedAt: LessThan(cutoffDate),
                },
                take: ARCHIVE_BATCH_SIZE,
                order: { updatedAt: 'ASC' },
            });

            if (batch.length === 0) break;

            const archives = batch.map(r => this.archiveRepo.create({
                originalId: r.id,
                correlationId: r.correlationId,
                internalNumber: r.internalNumber,
                description: r.description,
                short_description: r.short_description,
                type: r.type,
                priority: r.priority,
                payload: r.payload,
                sysId: r.sysId,
                snowNumber: r.snowNumber,
                status: r.status,
                source: r.source,
                immediate: r.immediate,
                fingerprint: r.fingerprint,
                expiresAt: r.expiresAt,
                retryCount: r.retryCount,
                maxRetries: r.maxRetries,
                nextRetryAt: r.nextRetryAt,
                lastError: r.lastError,
                resolvedAt: r.resolvedAt,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }));

            const ids = batch.map(r => r.id);

            await this.dataSource.transaction(async (manager) => {
                await manager.save(SnowRequestArchive, archives);
                await manager.delete(SnowRequestEntity, { id: In(ids) });
            });

            totalArchived += batch.length;

            if (batch.length < ARCHIVE_BATCH_SIZE) break;
        }

        if (totalArchived > 0) {
            this.logger.log(`Archivado completado: ${totalArchived} registros movidos a snow_requests_archive`);
        } else {
            this.logger.debug('Archivado: sin registros elegibles hoy');
        }
    }
}
