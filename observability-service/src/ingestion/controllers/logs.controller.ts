import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IngestLogsDto } from '../dto/ingest-logs.dto';
import { LogIngestionService } from '../services/log-ingestion.service';

@ApiTags('ingestion')
@Controller('ingest/logs')
export class LogsController {
    constructor(private readonly svc: LogIngestionService) {}

    @Public()
    @Post()
    @HttpCode(202)
    @ApiOperation({ summary: 'Ingest a batch of log entries (WinstonHttpTransport format)' })
    ingest(@Body() dto: IngestLogsDto): Promise<{ saved: number }> {
        return this.svc.ingest(dto);
    }
}
