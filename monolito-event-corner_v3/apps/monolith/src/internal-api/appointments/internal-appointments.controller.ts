// internal-api/appointments/internal-appointments.controller.ts
import { Controller, Get, Post, Patch, Body, Param, Query, Inject, HttpCode, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { AppointmentId, TechnicianId, CornerId, CustomerId, SlotId } from '@app/shared/types/branded-ids';
import { APPOINTMENT_SERVICE } from '../../core/ports/incoming/service-tokens';
import { IAppointmentService } from '../../core/ports/incoming/appointment/appointment-service.port';
import { APPOINTMENT_REPOSITORY, IAppointmentRepository } from '../../core/ports/outgoing/repositories/appointment-repository.port';
import { AppointmentStatus } from '../../core/domain/enums/appointment-status.enum';
import {
    CreateAppointmentDto,
    DeliverAppointmentDto,
    TakeAppointmentDto,
    ReleaseAppointmentDto,
    RescheduleAppointmentDto,
    SetEstimatedCloseDto,
    ChangeStatusDto,
    BatchStatusChangeDto,
    ValidateAppointmentDto,
    ReopenAppointmentDto,
    CancelAppointmentDto,
    ListAppointmentsQueryDto,
} from './dto/appointments.dto';
import { TracingService } from '@app/observability';

/**
 * Superficie unificada "Cita": sin fijar kind — cualquier IssueType
 * (ISSUE o REQUEST-*) pasa por acá. Reemplaza a internal-incidents e
 * internal-requests, que se borraron tras la unificación del frontend.
 */
@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('internal/appointments')
export class InternalAppointmentsController {
    private readonly logger = new Logger(InternalAppointmentsController.name);

    constructor(
        @Inject(APPOINTMENT_SERVICE) private readonly service: IAppointmentService,
        @Inject(APPOINTMENT_REPOSITORY) private readonly repository: IAppointmentRepository,
        private readonly tracing: TracingService,
    ) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear cita', description: 'Crea una nueva cita asociada a un cliente, corner y slots reservados. El tipo de ticket SN (incidencia/tarea) se deriva del IssueType elegido.' })
    @ApiResponse({ status: 201, description: 'Cita creada' })
    @ApiResponse({ status: 400, description: 'Datos inválidos' })
    async create(@Body() body: CreateAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.create', { kind: 'server' }, () => this._create(body));
    }

    private async _create(body: CreateAppointmentDto) {
        return unwrapOrThrow(await this.service.createAppointment(body as any));
    }

    @Get('available')
    @ApiOperation({ summary: 'Citas disponibles en un corner', description: 'Lista las citas en estado DELIVERED sin técnico asignado para un corner.' })
    @ApiQuery({ name: 'cornerId', required: true, example: 'uuid-corner' })
    @ApiResponse({ status: 200, description: 'Lista de citas disponibles' })
    async getAvailable(@Query('cornerId') cornerId: string) {
        return unwrapOrThrow(await this.service.getAvailableAppointments(CornerId(cornerId)));
    }

    @Get('technician/:technicianId')
    @ApiOperation({ summary: 'Citas de un técnico', description: 'Retorna las citas activas asignadas al técnico.' })
    @ApiParam({ name: 'technicianId', example: 'uuid-technician' })
    @ApiResponse({ status: 200, description: 'Lista de citas del técnico' })
    async getByTechnician(@Param('technicianId') techId: string) {
        return unwrapOrThrow(await this.service.getTechnicianAppointments(TechnicianId(techId)));
    }

    @Get()
    @ApiOperation({ summary: 'Listar citas con filtros', description: 'Búsqueda paginada con filtros opcionales. Todos los parámetros son opcionales.' })
    @ApiResponse({ status: 200, description: 'Lista paginada de citas' })
    async list(@Query() query: ListAppointmentsQueryDto) {
        const filters = {
            cornerId: query.cornerId as any,
            customerId: query.customerId as any,
            companyId: query.companyId as any,
            technicianId: query.technicianId as any,
            availableOnly: query.availableOnly === 'true',
            issueTypeId: query.issueTypeId as any,
            customerEmail: query.customerEmail,
            servicenowNumber: query.servicenowNumber,
            deviceSerial: query.deviceSerial,
            status: query.status ? (query.status.split(',').map(s => s.trim()) as AppointmentStatus[]) : undefined,
            fromDate: query.dateFrom ? new Date(query.dateFrom) : undefined,
            toDate: query.dateTo ? new Date(query.dateTo) : undefined,
            page: query.page,
            limit: query.limit,
        };
        return unwrapOrThrow(await this.repository.findWithFilters(filters));
    }

    @Get('by-number/:number')
    @ApiOperation({ summary: 'Obtener cita por número de ServiceNow', description: 'Busca por el número de ticket ServiceNow (ej: INC0001234).' })
    @ApiParam({ name: 'number', example: 'INC0001234' })
    @ApiResponse({ status: 200, description: 'Detalle de la cita' })
    @ApiResponse({ status: 404, description: 'No encontrada' })
    async getByNumber(@Param('number') number: string) {
        return unwrapOrThrow(await this.repository.findByServiceNowNumber(number));
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener cita por ID' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Detalle de la cita' })
    @ApiResponse({ status: 404, description: 'No encontrada' })
    async getOne(@Param('id') id: string) {
        return unwrapOrThrow(await this.service.getAppointment(AppointmentId(id)));
    }

    @Patch(':id/deliver')
    @ApiOperation({ summary: 'Registrar entrega del dispositivo', description: 'Transiciona la cita a DELIVERED. El cliente entrega el dispositivo al técnico en el corner.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Entrega registrada' })
    async deliver(@Param('id') id: string, @Body() dto: DeliverAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.deliver', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._deliver(id, dto));
    }

    private async _deliver(id: string, dto: DeliverAppointmentDto) {
        return unwrapOrThrow(await this.service.deliverAppointment({
            appointmentId: AppointmentId(id),
            technicianId: TechnicianId(dto.technicianId),
        }));
    }

    @Patch(':id/take')
    @ApiOperation({ summary: 'Técnico toma la cita', description: 'Asigna la cita al técnico y la pasa a IN_PROGRESS.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Cita tomada' })
    async take(@Param('id') id: string, @Body() dto: TakeAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.take', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._take(id, dto));
    }

    private async _take(id: string, dto: TakeAppointmentDto) {
        return unwrapOrThrow(await this.service.takeAppointment({
            appointmentId: AppointmentId(id),
            technicianId: TechnicianId(dto.technicianId),
            slotIds: dto.slotIds?.map((s) => SlotId(s)),
        }));
    }

    @Patch(':id/release')
    @ApiOperation({ summary: 'Técnico libera la cita', description: 'El técnico devuelve la cita al pool de disponibles.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Cita liberada' })
    async release(@Param('id') id: string, @Body() dto: ReleaseAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.release', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._release(id, dto));
    }

    private async _release(id: string, dto: ReleaseAppointmentDto) {
        return unwrapOrThrow(await this.service.releaseAppointment({
            appointmentId: AppointmentId(id),
            technicianId: TechnicianId(dto.technicianId),
            reason: dto.reason,
        }));
    }

    @Patch(':id/reschedule')
    @ApiOperation({ summary: 'Reprogramar la cita', description: 'Cambia el horario de la cita: reserva el/los slot(s) nuevo(s) y libera el/los actual(es) (a AVAILABLE si es futuro, EXPIRED si ya pasó). Requiere ser el técnico asignado. Permitido desde cualquier estado no terminal.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Cita reprogramada' })
    @ApiResponse({ status: 400, description: 'Horario no disponible o técnico no autorizado' })
    async reschedule(@Param('id') id: string, @Body() dto: RescheduleAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.reschedule', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._reschedule(id, dto));
    }

    private async _reschedule(id: string, dto: RescheduleAppointmentDto) {
        return unwrapOrThrow(await this.service.rescheduleAppointment({
            appointmentId: AppointmentId(id),
            technicianId: TechnicianId(dto.technicianId),
            slotIds: dto.slotIds.map((s) => SlotId(s)),
        }));
    }

    @Patch(':id/estimated-close')
    @ApiOperation({ summary: 'Corregir la fecha estimada de cierre', description: 'Dato informativo del técnico, no toca slots ni disponibilidad. Requiere ser el técnico asignado. Permitido desde cualquier estado no terminal.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Cierre estimado actualizado' })
    async setEstimatedClose(@Param('id') id: string, @Body() dto: SetEstimatedCloseDto) {
        return this.tracing.run('monolith.controller.appointments.setEstimatedClose', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._setEstimatedClose(id, dto));
    }

    private async _setEstimatedClose(id: string, dto: SetEstimatedCloseDto) {
        return unwrapOrThrow(await this.service.setEstimatedClose({
            appointmentId: AppointmentId(id),
            technicianId: TechnicianId(dto.technicianId),
            estimatedCloseAt: new Date(dto.estimatedCloseAt),
        }));
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Cambiar estado de la cita', description: 'Cambia el estado manualmente. Ver enum AppointmentStatus para los valores válidos.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Estado actualizado' })
    @ApiResponse({ status: 400, description: 'Transición de estado inválida' })
    async changeStatus(@Param('id') id: string, @Body() dto: ChangeStatusDto) {
        return this.tracing.run('monolith.controller.appointments.changeStatus', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._changeStatus(id, dto));
    }

    private async _changeStatus(id: string, dto: ChangeStatusDto) {
        return unwrapOrThrow(await this.service.changeStatus({
            appointmentId: AppointmentId(id),
            technicianId: TechnicianId(dto.technicianId),
            newStatus: dto.newStatus as unknown as AppointmentStatus,
            comment: dto.comment,
            closeCategory: dto.closeCategory,
        }));
    }

    @Post('batch-status')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cambio de estado en lote', description: 'Cambia el estado de múltiples citas en una sola operación (máx 50).' })
    @ApiResponse({ status: 200, description: 'Resultado del proceso por lote' })
    @ApiResponse({ status: 400, description: 'Array vacío o supera el límite de 50' })
    async batchChangeStatus(@Body() body: BatchStatusChangeDto) {
        if (!Array.isArray(body?.items) || body.items.length === 0) {
            throw new BadRequestException('items must be a non-empty array');
        }
        if (body.items.length > 50) {
            throw new BadRequestException('Batch size cannot exceed 50 items');
        }
        return this.tracing.run('monolith.controller.appointments.batchChangeStatus', { kind: 'server', attributes: { 'batch.count': String(body.items.length) } }, () => this._batchChangeStatus(body));
    }

    private async _batchChangeStatus(body: BatchStatusChangeDto) {
        const items = body.items.map((item) => ({
            appointmentId: item.incidentId,
            targetStatus: item.targetStatus as unknown as AppointmentStatus,
            technicianId: item.technicianId,
            comment: item.comment,
            closeCategory: item.closeCategory,
            reason: item.reason,
        }));
        return unwrapOrThrow(await this.service.batchChangeStatus(items));
    }

    @Patch(':id/validate')
    @ApiOperation({ summary: 'Cliente valida la resolución', description: 'El cliente confirma que la cita fue resuelta. Transiciona a VALIDATED.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Resolución validada' })
    async validate(@Param('id') id: string, @Body() dto: ValidateAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.validate', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._validate(id, dto));
    }

    private async _validate(id: string, dto: ValidateAppointmentDto) {
        return unwrapOrThrow(await this.service.validateAppointment({
            appointmentId: AppointmentId(id),
            customerId: CustomerId(dto.customerId),
        }));
    }

    @Patch(':id/reopen')
    @ApiOperation({ summary: 'Cliente reabre la cita', description: 'El cliente rechaza la resolución. Transiciona a REOPENED.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Cita reabierta' })
    async reopen(@Param('id') id: string, @Body() dto: ReopenAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.reopen', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._reopen(id, dto));
    }

    private async _reopen(id: string, dto: ReopenAppointmentDto) {
        return unwrapOrThrow(await this.service.reopenAppointment({
            appointmentId: AppointmentId(id),
            customerId: CustomerId(dto.customerId),
            reason: dto.reason,
        }));
    }

    @Get(':id/timeline')
    @ApiOperation({ summary: 'Historial de la cita', description: 'Devuelve la línea de tiempo completa de la cita ordenada cronológicamente.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Timeline de la cita' })
    async getTimeline(@Param('id') id: string) {
        return unwrapOrThrow(await this.repository.getTimeline(AppointmentId(id)));
    }

    @Post(':id/notes')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Agregar nota a la cita', description: 'Registra una nota o comentario de avance sin cambiar el estado.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 201, description: 'Nota agregada' })
    async addNote(
        @Param('id') id: string,
        @Body() body: { technicianId?: string; comment: string },
    ) {
        return this.tracing.run('monolith.controller.appointments.addNote', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._addNote(id, body));
    }

    private async _addNote(id: string, body: { technicianId?: string; comment: string }) {
        if (!body.comment?.trim()) throw new BadRequestException('comment is required');
        return unwrapOrThrow(
            await this.repository.addNote(
                AppointmentId(id),
                body.technicianId ? TechnicianId(body.technicianId) : null,
                body.comment.trim(),
            ),
        );
    }

    @Patch(':id/cancel')
    @ApiOperation({ summary: 'Cliente cancela su cita', description: 'El cliente cancela la cita. Solo válido desde estado CREATED. Transiciona a CANCELED.' })
    @ApiParam({ name: 'id', example: 'uuid-appointment' })
    @ApiResponse({ status: 200, description: 'Cita cancelada' })
    @ApiResponse({ status: 400, description: 'Solo se pueden cancelar citas en estado CREATED' })
    async cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto) {
        return this.tracing.run('monolith.controller.appointments.cancel', { kind: 'server', attributes: { 'appointment.id': id } }, () => this._cancel(id, dto));
    }

    private async _cancel(id: string, dto: CancelAppointmentDto) {
        return unwrapOrThrow(await this.service.cancelAppointment({
            appointmentId: AppointmentId(id),
            customerId: CustomerId(dto.customerId),
            reason: dto.reason,
        }));
    }
}
