import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryMetricsDto } from '../dto/query-metrics.dto';
import { MetricQueryService } from '../services/metric-query.service';

@ApiTags('query')
@Controller('query/metrics')
export class MetricsQueryController {
    constructor(private readonly svc: MetricQueryService) {}

    @Get('names')
    @ApiOperation({ summary: 'List distinct metric names' })
    names(): Promise<string[]> {
        return this.svc.names();
    }

    @Get('services')
    @ApiOperation({ summary: 'List distinct services that have sent metrics' })
    services(): Promise<string[]> {
        return this.svc.services();
    }

    @Get()
    @ApiOperation({ summary: 'Query stored metric data points' })
    query(@Query() dto: QueryMetricsDto) {
        return this.svc.query(dto);
    }
}
