import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IngestTracesDto } from '../dto/ingest-traces.dto';
import { TraceIngestionService } from '../services/trace-ingestion.service';

@ApiTags('ingestion')
@Controller('ingest/traces')
export class TracesController {
    constructor(private readonly svc: TraceIngestionService) {}

    @Public()
    @Post()
    @HttpCode(202)
    @ApiOperation({ summary: 'Ingest OTLP/HTTP JSON traces (resourceSpans envelope)' })
    ingest(@Body() dto: IngestTracesDto): Promise<{ saved: number }> {
        return this.svc.ingest(dto);
    }
}
