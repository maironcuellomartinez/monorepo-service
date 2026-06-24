import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryTracesDto } from '../dto/query-traces.dto';
import { TraceQueryService } from '../services/trace-query.service';

@ApiTags('query')
@Controller('query/traces')
export class TracesQueryController {
    constructor(private readonly svc: TraceQueryService) {}

    @Get('services')
    @ApiOperation({ summary: 'List distinct services that have sent spans' })
    services(): Promise<string[]> {
        return this.svc.services();
    }

    @Get()
    @ApiOperation({ summary: 'Query stored trace spans' })
    query(@Query() dto: QueryTracesDto) {
        return this.svc.query(dto);
    }

    @Get(':traceId')
    @ApiOperation({ summary: 'Get all spans for a single trace' })
    getTrace(@Param('traceId') traceId: string) {
        return this.svc.getTrace(traceId);
    }
}
