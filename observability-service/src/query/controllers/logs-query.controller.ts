import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryLogsDto } from '../dto/query-logs.dto';
import { LogQueryService } from '../services/log-query.service';

@ApiTags('query')
@Controller('query/logs')
export class LogsQueryController {
    constructor(private readonly svc: LogQueryService) {}

    @Get('services')
    @ApiOperation({ summary: 'List distinct services that have sent logs' })
    services(): Promise<string[]> {
        return this.svc.services();
    }

    @Get()
    @ApiOperation({ summary: 'Query stored log entries' })
    query(@Query() dto: QueryLogsDto) {
        return this.svc.query(dto);
    }
}
