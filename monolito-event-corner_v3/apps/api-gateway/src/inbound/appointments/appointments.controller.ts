// api-gateway/inbound/appointments/appointments.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../auth/decorators/current-user.decorator';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { TakeAppointmentDto } from './dto/take-appointment.dto';
import { ReleaseAppointmentDto } from './dto/release-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { SetEstimatedCloseDto } from './dto/set-estimated-close.dto';
import { ChangeAppointmentStatusDto } from './dto/change-status.dto';
import { TracingService } from '@app/observability';

/**
 * Superficie unificada "Cita" para el frontend event-corner-app. Proxy
 * delgado hacia /internal/appointments del monolito. Permisos ABAC bajo
 * el recurso `appointment:*` (abac-microservice/src/scripts/seed-initial-data.ts).
 */
@ApiTags('Appointments')
@ApiBearerAuth('jwt')
@Controller('api/appointments')
export class AppointmentsController {
  constructor(
    private readonly monolith: MonolithClient,
    private readonly tracing: TracingService,
  ) {}

  @Get('users')
  @Permission('appointment', 'create')
  @Roles('technician', 'admin', 'super-admin')
  @ApiOperation({
    summary: 'Listar usuarios activos — para el picker al crear citas',
  })
  async listUsers() {
    return this.monolith.get('/users');
  }

  @Get('users/search')
  @Permission('appointment', 'create')
  @Roles('technician', 'admin', 'super-admin')
  @ApiOperation({
    summary: 'Buscar usuarios activos — para el picker al crear citas',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Término de búsqueda (mínimo 2 caracteres)',
  })
  async searchUsers(@Query('q') q: string) {
    return this.monolith.get('/users/search', { q });
  }

  @Get()
  @Permission('appointment', 'list')
  @ApiOperation({
    summary: 'Listar citas con filtros',
    description: 'Búsqueda paginada con filtros opcionales.',
  })
  @ApiQuery({ name: 'cornerId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Estados separados por coma: CREATED,IN_PROGRESS',
  })
  @ApiQuery({ name: 'issueTypeId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'customerEmail', required: false })
  @ApiQuery({ name: 'servicenowNumber', required: false })
  @ApiQuery({
    name: 'deviceSerial',
    required: false,
    description: 'Filtrar por serial del dispositivo (parcial)',
  })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'availableOnly',
    required: false,
    description: 'true = solo citas sin técnico asignado',
  })
  async list(
    @Query('cornerId') cornerId?: string,
    @Query('status') status?: string,
    @Query('issueTypeId') issueTypeId?: string,
    @Query('customerId') customerId?: string,
    @Query('customerEmail') customerEmail?: string,
    @Query('servicenowNumber') servicenowNumber?: string,
    @Query('deviceSerial') deviceSerial?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('availableOnly') availableOnly?: string,
  ) {
    return this.monolith.get('/appointments', {
      cornerId,
      status,
      issueTypeId,
      customerId,
      customerEmail,
      servicenowNumber,
      deviceSerial,
      dateFrom,
      dateTo,
      page,
      limit,
      availableOnly,
    });
  }

  @Get('mine')
  @Permission('appointment', 'read')
  @ApiOperation({
    summary: 'Citas del usuario autenticado',
    description:
      'Retorna las citas del usuario identificado por el JWT (empleado).',
  })
  async mine(@CurrentUser() user: JwtPayload) {
    const monolithUser = await this.monolith.get<{ id: string }>(
      `/users/by-external-id/${user.sub}`,
    );
    return this.monolith.get('/appointments', {
      customerId: monolithUser.id,
      limit: '50',
    });
  }

  @Get('available')
  @Permission('appointment', 'list')
  @ApiOperation({
    summary: 'Citas disponibles para tomar',
    description:
      'Lista citas sin técnico asignado en el corner indicado.',
  })
  @ApiQuery({ name: 'cornerId', required: true })
  async getAvailable(@Query('cornerId') cornerId: string) {
    return this.monolith.get('/appointments/available', { cornerId });
  }

  @Get('technician/:technicianId')
  @Permission('appointment', 'list')
  @ApiOperation({ summary: 'Citas de un técnico' })
  @ApiParam({ name: 'technicianId' })
  async getByTechnician(@Param('technicianId') technicianId: string) {
    return this.monolith.get(`/appointments/technician/${technicianId}`);
  }

  @Get(':id')
  @Permission('appointment', 'read')
  @ApiOperation({ summary: 'Obtener cita por ID' })
  @ApiParam({ name: 'id' })
  async getOne(@Param('id') id: string) {
    return this.monolith.get(`/appointments/${id}`);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('employee', 'technician', 'admin', 'super-admin')
  @Permission('appointment', 'create')
  @ApiOperation({
    summary: 'Crear cita',
    description: 'Estado inicial: CREATED.',
  })
  async create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: JwtPayload) {
    return this.tracing.run(
      'gateway.controller.appointments.create',
      { kind: 'server' },
      () => this._create(dto, user),
    );
  }
  private async _create(dto: CreateAppointmentDto, user: JwtPayload) {
    return this.monolith.post('/appointments', { ...dto, creatorExternalId: user.sub });
  }

  @Patch(':id/deliver')
  @Roles('technician', 'admin', 'super-admin')
  @Permission('appointment', 'deliver')
  @ApiOperation({
    summary: 'Registrar entrega del dispositivo',
    description:
      'Transición CREATED → DELIVERED. Asigna el técnico que recibe el dispositivo.',
  })
  @ApiParam({ name: 'id' })
  async deliver(
    @Param('id') id: string,
    @Body() body: { technicianId: string },
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.deliver',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._deliver(id, body),
    );
  }
  private async _deliver(id: string, body: { technicianId: string }) {
    return this.monolith.patch(`/appointments/${id}/deliver`, body);
  }

  @Patch(':id/take')
  @Roles('technician', 'admin', 'super-admin')
  @Permission('appointment', 'take')
  @ApiOperation({
    summary: 'Tomar cita',
    description: 'Asigna el técnico sin cambiar el estado.',
  })
  @ApiParam({ name: 'id' })
  async take(@Param('id') id: string, @Body() dto: TakeAppointmentDto) {
    return this.tracing.run(
      'gateway.controller.appointments.take',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._take(id, dto),
    );
  }
  private async _take(id: string, dto: TakeAppointmentDto) {
    return this.monolith.patch(`/appointments/${id}/take`, dto);
  }

  @Patch(':id/release')
  @Roles('technician', 'admin', 'super-admin')
  @Permission('appointment', 'release')
  @ApiOperation({
    summary: 'Liberar cita',
    description: 'Quita al técnico asignado sin cambiar el estado.',
  })
  @ApiParam({ name: 'id' })
  async release(@Param('id') id: string, @Body() dto: ReleaseAppointmentDto) {
    return this.tracing.run(
      'gateway.controller.appointments.release',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._release(id, dto),
    );
  }
  private async _release(id: string, dto: ReleaseAppointmentDto) {
    return this.monolith.patch(`/appointments/${id}/release`, dto);
  }

  @Patch(':id/reschedule')
  @Roles('technician', 'admin', 'super-admin')
  @Permission('appointment', 'change-status')
  @ApiOperation({
    summary: 'Reprogramar la cita',
    description:
      'Cambia el horario de la cita (nuevo slot + libera el anterior). Requiere ser el técnico asignado. Permitido desde cualquier estado no terminal.',
  })
  @ApiParam({ name: 'id' })
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.reschedule',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._reschedule(id, dto),
    );
  }
  private async _reschedule(id: string, dto: RescheduleAppointmentDto) {
    return this.monolith.patch(`/appointments/${id}/reschedule`, dto);
  }

  @Patch(':id/estimated-close')
  @Roles('technician', 'admin', 'super-admin')
  @Permission('appointment', 'change-status')
  @ApiOperation({
    summary: 'Corregir la fecha estimada de cierre',
    description:
      'Dato informativo del técnico, no toca slots. Requiere ser el técnico asignado.',
  })
  @ApiParam({ name: 'id' })
  async setEstimatedClose(
    @Param('id') id: string,
    @Body() dto: SetEstimatedCloseDto,
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.setEstimatedClose',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._setEstimatedClose(id, dto),
    );
  }
  private async _setEstimatedClose(id: string, dto: SetEstimatedCloseDto) {
    return this.monolith.patch(`/appointments/${id}/estimated-close`, dto);
  }

  @Patch(':id/status')
  @Roles('employee', 'technician', 'admin', 'super-admin')
  @Permission('appointment', 'change-status')
  @ApiOperation({
    summary: 'Cambiar estado',
    description:
      'Transiciones válidas según la máquina de estados (IN_PROGRESS, PENDING_*, CLOSED, etc.).',
  })
  @ApiParam({ name: 'id' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeAppointmentStatusDto,
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.changeStatus',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._changeStatus(id, dto),
    );
  }
  private async _changeStatus(id: string, dto: ChangeAppointmentStatusDto) {
    return this.monolith.patch(`/appointments/${id}/status`, dto);
  }

  @Patch(':id/cancel')
  @Roles('employee', 'technician', 'admin', 'super-admin')
  @Permission('appointment', 'change-status')
  @ApiOperation({
    summary: 'Cancelar cita',
    description:
      'El cliente cancela su cita. Solo válido desde CREATED → CANCELED.',
  })
  @ApiParam({ name: 'id' })
  async cancel(
    @Param('id') id: string,
    @Body() body: { customerId: string; reason?: string },
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.cancel',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._cancel(id, body),
    );
  }
  private async _cancel(
    id: string,
    body: { customerId: string; reason?: string },
  ) {
    return this.monolith.patch(`/appointments/${id}/cancel`, body);
  }

  @Patch(':id/validate')
  @Roles('employee', 'technician', 'admin', 'super-admin')
  @Permission('appointment', 'validate')
  @ApiOperation({
    summary: 'Validar resolución',
    description:
      'El cliente confirma que la cita está resuelta. Transición CLOSED → VALIDATED.',
  })
  @ApiParam({ name: 'id' })
  async validate(
    @Param('id') id: string,
    @Body() body: { customerId: string },
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.validate',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._validate(id, body),
    );
  }
  private async _validate(id: string, body: { customerId: string }) {
    return this.monolith.patch(`/appointments/${id}/validate`, body);
  }

  @Patch(':id/reopen')
  @Roles('employee', 'technician', 'admin', 'super-admin')
  @Permission('appointment', 'reopen')
  @ApiOperation({
    summary: 'Reabrir cita',
    description:
      'El cliente rechaza la resolución. Transición CLOSED → REOPENED.',
  })
  @ApiParam({ name: 'id' })
  async reopen(
    @Param('id') id: string,
    @Body() body: { customerId: string; reason?: string },
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.reopen',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._reopen(id, body),
    );
  }
  private async _reopen(
    id: string,
    body: { customerId: string; reason?: string },
  ) {
    return this.monolith.patch(`/appointments/${id}/reopen`, body);
  }

  @Get(':id/timeline')
  @Permission('appointment', 'read')
  @ApiOperation({
    summary: 'Historial de la cita',
    description:
      'Devuelve la línea de tiempo completa de la cita ordenada cronológicamente.',
  })
  @ApiParam({ name: 'id' })
  async getTimeline(@Param('id') id: string) {
    return this.monolith.get(`/appointments/${id}/timeline`);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  @Roles('technician', 'admin', 'super-admin')
  @Permission('appointment', 'change-status')
  @ApiOperation({
    summary: 'Agregar nota de avance',
    description: 'Registra una nota sin cambiar el estado de la cita.',
  })
  @ApiParam({ name: 'id' })
  async addNote(
    @Param('id') id: string,
    @Body() body: { technicianId?: string; comment: string },
  ) {
    return this.tracing.run(
      'gateway.controller.appointments.addNote',
      { kind: 'server', attributes: { 'appointment.id': id } },
      () => this._addNote(id, body),
    );
  }
  private async _addNote(
    id: string,
    body: { technicianId?: string; comment: string },
  ) {
    return this.monolith.post(`/appointments/${id}/notes`, body);
  }
}
