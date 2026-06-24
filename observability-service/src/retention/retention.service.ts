import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { LogEntryEntity } from '../persistence/entities/log-entry.entity';
import { TraceSpanEntity } from '../persistence/entities/trace-span.entity';
import { MetricPointEntity } from '../persistence/entities/metric-point.entity';

@Injectable()
export class RetentionService {
    private readonly logger = new Logger(RetentionService.name);

    constructor(
        @InjectRepository(LogEntryEntity) private readonly logsRepo: Repository<LogEntryEntity>,
        @InjectRepository(TraceSpanEntity) private readonly spansRepo: Repository<TraceSpanEntity>,
        @InjectRepository(MetricPointEntity) private readonly metricsRepo: Repository<MetricPointEntity>,
    ) {}

    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async pruneOldData(): Promise<void> {
        const logDays = parseInt(process.env.LOG_RETENTION_DAYS ?? '30', 10);
        const traceDays = parseInt(process.env.TRACE_RETENTION_DAYS ?? '14', 10);
        const metricDays = parseInt(process.env.METRIC_RETENTION_DAYS ?? '90', 10);

        const now = Date.now();

        const logCutoff = new Date(now - logDays * 86_400_000);
        const traceCutoff = new Date(now - traceDays * 86_400_000);
        const metricCutoff = new Date(now - metricDays * 86_400_000);

        const [logs, spans, metrics] = await Promise.all([
            this.logsRepo.delete({ timestamp: LessThan(logCutoff) }),
            this.spansRepo.delete({ receivedAt: LessThan(traceCutoff) }),
            this.metricsRepo.delete({ timestamp: LessThan(metricCutoff) }),
        ]);

        this.logger.log(
            `Retention pruning complete — logs: ${logs.affected}, spans: ${spans.affected}, metrics: ${metrics.affected}`,
        );
    }
}
