// internal-api/corners/internal-corners.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Inject, HttpCode, HttpStatus, HttpException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam,
    ApiBearerAuth } from '@nestjs/swagger';
import { CORNER_SERVICE, SCHEDULE_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { ICornerService } from '@app/core/ports/incoming/corner/corner-service.port';
import { IScheduleService } from '@app/core/ports/incoming/schedule/schedule-service.port';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { CornerId, ScheduleId, TechnicianId } from '@app/shared/types/branded-ids';
import { CreateCornerDto, UpdateCornerDto, AddScheduleDto, AssignTechniciansDto } from './dto/corners.dto';
import { TracingService } from '@app/observability';

@ApiTags('Corners')
@ApiBearerAuth()
@Controller('internal/corners')
export class InternalCornersController {
    constructor(
        @Inject(CORNER_SERVICE) private readonly cornerService: ICornerService,
        @Inject(SCHEDULE_SERVICE) private readonly scheduleService: IScheduleService,
        private readonly tracing: TracingService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Listar corners activos' })
    @ApiResponse({ status: 200, description: 'Lista de corners activos' })
    async getAll() {
        return unwrapOrThrow(await this.cornerService.getAllActiveCorners());
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener corner por ID' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiResponse({ status: 200, description: 'Detalle del corner' })
    @ApiResponse({ status: 404, description: 'Corner no encontrado' })
    async getOne(@Param('id') id: string) {
        const corner = unwrapOrThrow(await this.cornerService.getCorner(id));
        if (!corner) throw new HttpException('Corner not found', HttpStatus.NOT_FOUND);
        return corner;
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear corner' })
    @ApiResponse({ status: 201, description: 'Corner creado' })
    @ApiResponse({ status: 400, description: 'Datos inválidos' })
    async create(@Body() dto: CreateCornerDto) {
        return this.tracing.run('monolith.controller.corners.create', { kind: 'server' }, () => this._create(dto));
    }

    private async _create(dto: CreateCornerDto) {
        return unwrapOrThrow(await this.cornerService.createCorner(dto));
    }

    @Put(':id')
    @ApiOperation({ summary: 'Actualizar corner', description: 'Actualización parcial — solo se modifican los campos enviados.' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiResponse({ status: 200, description: 'Corner actualizado' })
    async update(@Param('id') id: string, @Body() dto: UpdateCornerDto) {
        return this.tracing.run('monolith.controller.corners.update', { kind: 'server', attributes: { 'corner.id': id } }, () => this._update(id, dto));
    }

    private async _update(id: string, dto: UpdateCornerDto) {
        return unwrapOrThrow(await this.cornerService.updateCorner(id, dto));
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Desactivar corner', description: 'Soft delete — establece isActive: false.' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiResponse({ status: 200, description: 'Corner desactivado' })
    async deactivate(@Param('id') id: string) {
        return this.tracing.run('monolith.controller.corners.deactivate', { kind: 'server', attributes: { 'corner.id': id } }, () => this._deactivate(id));
    }

    private async _deactivate(id: string) {
        return unwrapOrThrow(await this.cornerService.updateCorner(id, { isActive: false }));
    }

    @Post(':id/schedules')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Agregar horario al corner' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiResponse({ status: 201, description: 'Horario creado' })
    async addSchedule(@Param('id') cornerId: string, @Body() dto: AddScheduleDto) {
        return this.tracing.run('monolith.controller.corners.addSchedule', { kind: 'server', attributes: { 'corner.id': cornerId } }, () => this._addSchedule(cornerId, dto));
    }

    private async _addSchedule(cornerId: string, dto: AddScheduleDto) {
        return unwrapOrThrow(await this.scheduleService.createSchedule({
            ...dto,
            cornerId: CornerId(cornerId),
            dayOfWeek: dto.dayOfWeek ?? null,
            technicianIds: dto.technicianIds?.map(TechnicianId),
        }));
    }

    @Get(':id/schedules')
    @ApiOperation({ summary: 'Listar horarios del corner' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiResponse({ status: 200, description: 'Lista de horarios' })
    async getSchedules(@Param('id') cornerId: string) {
        return unwrapOrThrow(await this.scheduleService.getSchedulesByCorner(CornerId(cornerId)));
    }

    @Put(':id/schedules/:scheduleId')
    @ApiOperation({ summary: 'Actualizar horario', description: 'Borra slots no usados y regenera con los nuevos parámetros. Falla si hay slots con incidencias activas.' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiParam({ name: 'scheduleId', example: 'uuid-schedule' })
    @ApiResponse({ status: 200, description: 'Horario actualizado y slots regenerados' })
    @ApiResponse({ status: 400, description: 'Tiene turnos reservados — no se puede modificar' })
    async updateSchedule(
        @Param('scheduleId') scheduleId: string,
        @Body() dto: AddScheduleDto,
    ) {
        return this.tracing.run('monolith.controller.corners.updateSchedule', { kind: 'server', attributes: { 'schedule.id': scheduleId } }, () => this._updateSchedule(scheduleId, dto));
    }

    private async _updateSchedule(scheduleId: string, dto: AddScheduleDto) {
        return unwrapOrThrow(await this.scheduleService.updateSchedule(ScheduleId(scheduleId), {
            name: dto.name,
            dayOfWeek: dto.dayOfWeek,
            startTime: dto.startTime,
            endTime: dto.endTime,
            validFrom: dto.validFrom,
            validUntil: dto.validUntil,
            slotDurationMinutes: dto.slotDurationMinutes,
        }));
    }

    @Delete(':id/schedules/:scheduleId')
    @ApiOperation({ summary: 'Eliminar horario', description: 'Elimina el horario y sus slots no usados. Falla si hay incidencias activas.' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiParam({ name: 'scheduleId', example: 'uuid-schedule' })
    @ApiResponse({ status: 200, description: 'Horario eliminado' })
    @ApiResponse({ status: 400, description: 'El horario tiene slots y no puede eliminarse' })
    async deleteSchedule(
        @Param('scheduleId') scheduleId: string,
    ) {
        return this.tracing.run('monolith.controller.corners.deleteSchedule', { kind: 'server', attributes: { 'schedule.id': scheduleId } }, () => this._deleteSchedule(scheduleId));
    }

    private async _deleteSchedule(scheduleId: string) {
        unwrapOrThrow(await this.scheduleService.deleteSchedule(ScheduleId(scheduleId)));
        return { message: 'Schedule deleted successfully' };
    }

    @Post(':id/schedules/:scheduleId/technicians')
    @ApiOperation({ summary: 'Asignar técnicos a un horario', description: 'Reemplaza la lista completa de técnicos asignados al horario.' })
    @ApiParam({ name: 'id', example: 'uuid-corner' })
    @ApiParam({ name: 'scheduleId', example: 'uuid-schedule' })
    @ApiResponse({ status: 200, description: 'Técnicos asignados' })
    async assignTechnicians(
        @Param('scheduleId') scheduleId: string,
        @Body() dto: AssignTechniciansDto,
    ) {
        return this.tracing.run('monolith.controller.corners.assignTechnicians', { kind: 'server', attributes: { 'schedule.id': scheduleId } }, () => this._assignTechnicians(scheduleId, dto));
    }

    private async _assignTechnicians(scheduleId: string, dto: AssignTechniciansDto) {
        unwrapOrThrow(await this.scheduleService.assignTechnicians(ScheduleId(scheduleId), dto.technicianIds.map(TechnicianId)));
        return { message: 'Technicians assigned successfully' };
    }
}
