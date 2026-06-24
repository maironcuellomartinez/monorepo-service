import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IngestMetricsDto } from '../dto/ingest-metrics.dto';
import { MetricIngestionService } from '../services/metric-ingestion.service';

@ApiTags('ingestion')
@Controller('ingest/metrics')
export class MetricsController {
    constructor(private readonly svc: MetricIngestionService) {}

    @Public()
    @Post()
    @HttpCode(202)
    @ApiOperation({ summary: 'Ingest a batch of metric data points' })
    ingest(@Body() dto: IngestMetricsDto): Promise<{ saved: number }> {
        return this.svc.ingest(dto);
    }
}
