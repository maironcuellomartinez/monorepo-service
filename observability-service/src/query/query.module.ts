import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { LogQueryService } from './services/log-query.service';
import { TraceQueryService } from './services/trace-query.service';
import { MetricQueryService } from './services/metric-query.service';
import { LogsQueryController } from './controllers/logs-query.controller';
import { TracesQueryController } from './controllers/traces-query.controller';
import { MetricsQueryController } from './controllers/metrics-query.controller';

@Module({
    imports: [PersistenceModule],
    providers: [LogQueryService, TraceQueryService, MetricQueryService],
    controllers: [LogsQueryController, TracesQueryController, MetricsQueryController],
})
export class QueryModule {}
