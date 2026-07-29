// internal-api/requests/internal-requests.controller.ts
import { Controller, Get, Post, Patch, Body, Param, Query, Inject, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam,
    ApiBearerAuth } from '@nestjs/swagger';
import { APPOINTMENT_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IAppointmentService } from '@app/core/ports/incoming/appointment/appointment-service.port';
import { APPOINTMENT_REPOSITORY, IAppointmentRepository } from '@app/core/ports/outgoing/repositories/appointment-repository.port';
import { SLOT_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { ISlotRepository } from '@app/core/ports/outgoing/repositories/slot-repository.port';
import { ISSUE_TYPE_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { IIssueTypeRepository } from '@app/core/ports/outgoing/repositories/issue-type-repository.port';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { AppointmentStatus } from '@app/core/domain/enums/appointment-status.enum';
import { AppointmentId, CustomerId, TechnicianId, UserId, IssueTypeId, CornerId, CompanyId } from '@app/shared/types/branded-ids';
import { CreateRequestDto, UpdateRequestStatusDto, ListRequestsQueryDto } from './dto/requests.dto';
import { TracingService } from '@app/observability';

/**
 * Fachada delgada sobre IAppointmentService: rutas/DTOs byte-idénticos a los
 * de antes (paridad con RequestService), fijando implícitamente
 * createdByTechnicianId (siempre requerido acá, paridad con Request de hoy).
 *
 * Diferencia real de comportamiento (necesaria, no cosmética): Appointment
 * exige >=1 slot real reservado (cierra el double-booking que Request tenía
 * hoy al no reservar ninguno) — CreateRequestDto sigue enviando `scheduledAt`
 * puntual (mismo contrato), y acá se resuelve a slots reales vía
 * findConsecutiveSlots antes de crear la cita.
 */
@ApiTags('Requests')
@ApiBearerAuth()
@Controller('internal/requests')
export class InternalRequestsController {
    constructor(
        @Inject(APPOINTMENT_SERVICE) private readonly service: IAppointmentService,
        @Inject(APPOINTMENT_REPOSITORY) private readonly repository: IAppointmentRepository,
        @Inject(SLOT_REPOSITORY) private readonly slotRepo: ISlotRepository,
        @Inject(ISSUE_TYPE_REPOSITORY) private readonly issueTypeRepo: IIssueTypeRepository,
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
        const issueTypeId = IssueTypeId(body.issueTypeId);
        const issueType = unwrapOrThrow(await this.issueTypeRepo.findById(issueTypeId));
        if (!issueType) throw new BadRequestException(`Issue type ${body.issueTypeId} not found`);

        const startTime = new Date(body.scheduledAt);
        const durationMinutes = issueType.getTotalDurationMinutes();
        const slots = unwrapOrThrow(
            await this.slotRepo.findConsecutiveSlots(body.cornerId, startTime, durationMinutes),
        );
        if (slots.length === 0) {
            throw new BadRequestException(
                `No hay slots disponibles en el corner ${body.cornerId} a partir de ${startTime.toISOString()}`,
            );
        }

        return unwrapOrThrow(await this.service.createAppointment({
            issueTypeId,
            customerId: UserId(body.customerId),
            cornerId: CornerId(body.cornerId),
            slotIds: slots.map((s) => s.id),
            origin: 'TECH_APP',
            device: body.device,
            notes: body.notes,
            createdByTechnicianId: TechnicianId(body.technicianId),
            companyId: CompanyId(body.companyId),
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
            status:       query.status ? (query.status.split(',').map(s => s.trim()) as AppointmentStatus[]) : undefined,
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
        return unwrapOrThrow(await this.service.getAppointment(AppointmentId(id)));
    }

    @Get('technician/:technicianId')
    @ApiOperation({ summary: 'Solicitudes de un técnico' })
    @ApiParam({ name: 'technicianId', example: 'uuid-technician' })
    @ApiResponse({ status: 200, description: 'Lista de solicitudes del técnico' })
    async getByTechnician(@Param('technicianId') techId: string) {
        return unwrapOrThrow(await this.service.getTechnicianAppointments(TechnicianId(techId)));
    }

    @Get('customer/:customerId')
    @ApiOperation({ summary: 'Solicitudes de un cliente' })
    @ApiParam({ name: 'customerId', example: 'uuid-customer' })
    @ApiResponse({ status: 200, description: 'Lista de solicitudes del cliente' })
    async getByCustomer(@Param('customerId') customerId: string) {
        return unwrapOrThrow(await this.service.getCustomerAppointments(CustomerId(customerId)));
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Actualizar estado de una solicitud' })
    @ApiParam({ name: 'id', example: 'uuid-request' })
    @ApiResponse({ status: 200, description: 'Estado actualizado' })
    async updateStatus(@Param('id') id: string, @Body() body: UpdateRequestStatusDto) {
        return this.tracing.run('monolith.controller.requests.updateStatus', { kind: 'server', attributes: { 'request.id': id } }, () => this._updateStatus(id, body));
    }

    private async _updateStatus(id: string, body: UpdateRequestStatusDto) {
        return unwrapOrThrow(await this.service.changeStatus({
            appointmentId: AppointmentId(id),
            technicianId: TechnicianId(body.technicianId),
            newStatus: body.newStatus as unknown as AppointmentStatus,
            comment: body.comment,
        }));
    }
}
