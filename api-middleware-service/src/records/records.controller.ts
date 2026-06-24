import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RecordsService } from './records.service';
import { ListRequestsDto } from './dto/list-records.dto';
import { ListIssuesDto } from './dto/list-issues.dto';
import { AdminOrAccessGuard } from '../auth/guards/admin-or-access.guard';

@ApiTags('Records')
@ApiBearerAuth('access-token')
@UseGuards(AdminOrAccessGuard)
@Controller('v1')
export class RecordsController {
    constructor(private readonly service: RecordsService) {}

    @Get('requests/:number')
    @ApiOperation({ summary: 'Obtener solicitud por número (ej: REQ0001234)' })
    @ApiParam({ name: 'number', example: 'REQ0001234' })
    @ApiResponse({ status: 200 }) @ApiResponse({ status: 404 })
    getRequestByNumber(@Param('number') number: string) {
        return this.service.getRequestByNumber(number);
    }

    @Get('requests')
    @ApiOperation({ summary: 'Listar solicitudes con filtros' })
    @ApiResponse({ status: 200 })
    listRequests(@Query() query: ListRequestsDto) {
        return this.service.listRequests(query);
    }

    @Get('issues')
    @ApiOperation({ summary: 'Listar issues desde el sistema externo' })
    @ApiResponse({ status: 200 })
    listIssues(@Query() query: ListIssuesDto) {
        return this.service.getIssues(query);
    }
}
