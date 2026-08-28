import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { InternalOnly } from '../../auth/decorators/internal.decorator';
import { MicornerClient } from '../../client/micorner.client';

@ApiTags('External Records')
@ApiBearerAuth('jwt')
@InternalOnly()
@Controller('internal-api')
export class ExternalRecordsController {
    constructor(private readonly micorner: MicornerClient) {}

    @Get('incidents/by-number/:number')
    @ApiOperation({ summary: 'Incidencia por número SN — solo M2M' })
    @ApiParam({ name: 'number', example: 'INC0001234' })
    @ApiResponse({ status: 200 }) @ApiResponse({ status: 404 })
    getIncidentByNumber(@Param('number') number: string) {
        return this.micorner.getAppointmentByNumber(number);
    }

    @Get('requests/by-number/:number')
    @ApiOperation({ summary: 'Solicitud por número SN — solo M2M' })
    @ApiParam({ name: 'number', example: 'REQ0001234' })
    @ApiResponse({ status: 200 }) @ApiResponse({ status: 404 })
    getRequestByNumber(@Param('number') number: string) {
        return this.micorner.getAppointmentByNumber(number);
    }

    @Get('incidents')
    @ApiOperation({ summary: 'Listar incidencias con filtros — solo M2M' })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'issueTypeId', required: false })
    @ApiQuery({ name: 'cornerId', required: false })
    @ApiQuery({ name: 'customerId', required: false })
    @ApiQuery({ name: 'technicianId', required: false })
    @ApiQuery({ name: 'dateFrom', required: false })
    @ApiQuery({ name: 'dateTo', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiResponse({ status: 200 })
    listIncidents(@Query() query: Record<string, string>) {
        return this.micorner.listAppointments(query);
    }

    @Get('requests')
    @ApiOperation({ summary: 'Listar solicitudes con filtros — solo M2M' })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'issueTypeId', required: false })
    @ApiQuery({ name: 'cornerId', required: false })
    @ApiQuery({ name: 'companyId', required: false })
    @ApiQuery({ name: 'customerId', required: false })
    @ApiQuery({ name: 'technicianId', required: false })
    @ApiQuery({ name: 'dateFrom', required: false })
    @ApiQuery({ name: 'dateTo', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiResponse({ status: 200 })
    listRequests(@Query() query: Record<string, string>) {
        return this.micorner.listAppointments(query);
    }
}
