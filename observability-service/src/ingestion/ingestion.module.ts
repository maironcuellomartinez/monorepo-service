import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { ForwardingModule } from '../forwarding/forwarding.module';
import { LogIngestionService } from './services/log-ingestion.service';
import { TraceIngestionService } from './services/trace-ingestion.service';
import { MetricIngestionService } from './services/metric-ingestion.service';
import { LogsController } from './controllers/logs.controller';
import { TracesController } from './controllers/traces.controller';
import { MetricsController } from './controllers/metrics.controller';

@Module({
    imports: [PersistenceModule, ForwardingModule],
    providers: [LogIngestionService, TraceIngestionService, MetricIngestionService],
    controllers: [LogsController, TracesController, MetricsController],
})
export class IngestionModule {}
