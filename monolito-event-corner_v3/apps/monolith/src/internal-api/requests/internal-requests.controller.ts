// internal-api/requests/internal-requests.controller.ts
import { Controller, Get, Post, Patch, Body, Param, Query, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam,
    ApiBearerAuth } from '@nestjs/swagger';
import { REQUEST_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IRequestService } from '@app/core/ports/incoming/request/request-service.port';
import { REQUEST_REPOSITORY, IRequestRepository } from '@app/core/ports/outgoing/repositories/request-repository.port';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { RequestId, TechnicianId, UserId, IssueTypeId, CornerId, CompanyId } from '@app/shared/types/branded-ids';
import { CreateRequestDto, UpdateRequestStatusDto, ListRequestsQueryDto } from './dto/requests.dto';
import { TracingService } from '@app/observability';

@ApiTags('Requests')
@ApiBearerAuth()
@Controller('internal/requests')
export class InternalRequestsController {
    constructor(
        @Inject(REQUEST_SERVICE) private readonly service: IRequestService,
        @Inject(REQUEST_REPOSITORY) private readonly repository: IRequestRepository,
        private readonly tracing: TracingService,
    ) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear solicitud' })
    @ApiResponse({ status: 201, description: 'Solicitud creada' })
    @ApiResponse({ status: 400, description: 'Datos inválidos' })
    async create(@Body() body: CreateRequestDto) {
        return this.tracing.run('monolith.controller.requests.create', { kind: 'server' }, () => this._create(body));
    }

    private async _create(body: CreateRequestDto) {
        return unwrapOrThrow(await this.service.createRequest({
            issueTypeId: IssueTypeId(body.issueTypeId),
            technicianId: TechnicianId(body.technicianId),
            customerId: UserId(body.customerId),
            cornerId: CornerId(body.cornerId),
            companyId: CompanyId(body.companyId),
            scheduledAt: new Date(body.scheduledAt),
            notes: body.notes,
            device: body.device,
        }));
    }

    @Get()
    @ApiOperation({ summary: 'Listar solicitudes con filtros' })
    @ApiResponse({ status: 200, description: 'Lista paginada de solicitudes' })
    async list(@Query() query: ListRequestsQueryDto) {
        const filters = {
            cornerId:     query.cornerId     as any,
            customerId:   query.customerId   as any,
            technicianId: query.technicianId as any,
            companyId:    query.companyId    as any,
            issueTypeId:  query.issueTypeId  as any,
            status:       query.status ? query.status.split(',').map(s => s.trim()) : undefined,
            fromDate:     query.dateFrom ? new Date(query.dateFrom) : undefined,
            toDate:       query.dateTo   ? new Date(query.dateTo)   : undefined,
            page:         query.page,
            limit:        query.limit,
        };
        return unwrapOrThrow(await this.repository.findWithFilters(filters));
    }

    @Get('by-number/:number')
    @ApiOperation({ summary: 'Obtener solicitud por número de ServiceNow' })
    @ApiParam({ name: 'number', example: 'REQ0001234' })
    @ApiResponse({ status: 200, description: 'Detalle de la solicitud' })
    @ApiResponse({ status: 404, description: 'No encontrada' })
    async getByNumber(@Param('number') number: string) {
        return unwrapOrThrow(await this.repository.findByServiceNowNumber(number));
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener solicitud por ID' })
    @ApiParam({ name: 'id', example: 'uuid-request' })
    @ApiResponse({ status: 200, description: 'Detalle de la solicitud' })
    @ApiResponse({ status: 404, description: 'No encontrada' })
    async getOne(@Param('id') id: string) {
        return unwrapOrThrow(await this.service.getRequest(RequestId(id)));
    }

    @Get('technician/:technicianId')
    @ApiOperation({ summary: 'Solicitudes de un técnico' })
    @ApiParam({ name: 'technicianId', example: 'uuid-technician' })
    @ApiResponse({ status: 200, description: 'Lista de solicitudes del técnico' })
    async getByTechnician(@Param('technicianId') techId: string) {
        return unwrapOrThrow(await this.service.getRequestsByTechnician(TechnicianId(techId)));
    }

    @Get('customer/:customerId')
    @ApiOperation({ summary: 'Solicitudes de un cliente' })
    @ApiParam({ name: 'customerId', example: 'uuid-customer' })
    @ApiResponse({ status: 200, description: 'Lista de solicitudes del cliente' })
    async getByCustomer(@Param('customerId') customerId: string) {
        return unwrapOrThrow(await this.service.getRequestsByCustomer(UserId(customerId)));
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Actualizar estado de una solicitud' })
    @ApiParam({ name: 'id', example: 'uuid-request' })
    @ApiResponse({ status: 200, description: 'Estado actualizado' })
    async updateStatus(@Param('id') id: string, @Body() body: UpdateRequestStatusDto) {
        return this.tracing.run('monolith.controller.requests.updateStatus', { kind: 'server', attributes: { 'request.id': id } }, () => this._updateStatus(id, body));
    }

    private async _updateStatus(id: string, body: UpdateRequestStatusDto) {
        return unwrapOrThrow(await this.service.updateRequestStatus({
            requestId: RequestId(id),
            technicianId: TechnicianId(body.technicianId),
            newStatus: body.newStatus,
            comment: body.comment,
        }));
    }
}
