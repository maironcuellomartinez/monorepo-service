// api-gateway/inbound/incidents/incidents.controller.ts
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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../auth/decorators/current-user.decorator';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { TakeIncidentDto } from './dto/take-incident.dto';
import { ReleaseIncidentDto } from './dto/release-incident.dto';
import { ChangeIncidentStatusDto } from './dto/change-status.dto';
import { TracingService } from '@app/observability';

@ApiTags('Incidents')
@ApiBearerAuth('jwt')
@Controller('api/incidents')
export class IncidentsController {
    constructor(
        private readonly monolith: MonolithClient,
        private readonly tracing: TracingService,
    ) { }

    @Get('users')
    @Permission('incident', 'create')
    @Roles('technician', 'admin', 'super-admin')
    @ApiOperation({ summary: 'Listar usuarios activos — para el picker al crear incidencias' })
    async listUsers() {
        return this.monolith.get('/users');
    }

    @Get('users/search')
    @Permission('incident', 'create')
    @Roles('technician', 'admin', 'super-admin')
    @ApiOperation({ summary: 'Buscar usuarios activos con empresa — para el picker al crear incidencias' })
    @ApiQuery({ name: 'q', required: true, description: 'Término de búsqueda (mínimo 2 caracteres)' })
    async searchUsers(@Query('q') q: string) {
        return this.monolith.get('/users/search', { q, withCompany: 'true' });
    }

    @Get()
    @Permission('incident', 'list')
    @ApiOperation({ summary: 'Listar incidencias con filtros', description: 'Búsqueda paginada con filtros opcionales.' })
    @ApiQuery({ name: 'cornerId', required: false })
    @ApiQuery({ name: 'status', required: false, description: 'Estados separados por coma: CREATED,IN_PROGRESS' })
    @ApiQuery({ name: 'issueTypeId', required: false })
    @ApiQuery({ name: 'customerId', required: false })
    @ApiQuery({ name: 'customerEmail', required: false })
    @ApiQuery({ name: 'servicenowNumber', required: false })
    @ApiQuery({ name: 'deviceSerial', required: false, description: 'Filtrar por serial del dispositivo (parcial)' })
    @ApiQuery({ name: 'dateFrom', required: false, example: '2026-01-01' })
    @ApiQuery({ name: 'dateTo', required: false, example: '2026-12-31' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'availableOnly', required: false, description: 'true = solo incidencias sin técnico asignado' })
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
        return this.monolith.listIncidents({
            cornerId, status, issueTypeId, customerId, customerEmail,
            servicenowNumber, deviceSerial, dateFrom, dateTo, page, limit, availableOnly,
        });
    }

    @Get('mine')
    @Permission('incident', 'read')
    @ApiOperation({ summary: 'Incidencias del usuario autenticado', description: 'Retorna las incidencias del usuario identificado por el JWT (empleado).' })
    async mine(@CurrentUser() user: JwtPayload) {
        const monolithUser = await this.monolith.get<{ id: string }>(
            `/users/by-external-id/${user.sub}`,
        );
        return this.monolith.listIncidents({ customerId: monolithUser.id, limit: '50' });
    }

    @Get('available')
    @Permission('incident', 'list')
    @ApiOperation({ summary: 'Incidencias disponibles para tomar', description: 'Lista incidencias sin técnico asignado en el corner indicado.' })
    @ApiQuery({ name: 'cornerId', required: true })
    async getAvailable(@Query('cornerId') cornerId: string) {
        return this.monolith.get('/incidents/available', { cornerId });
    }

    @Get('technician/:technicianId')
    @Permission('incident', 'list')
    @ApiOperation({ summary: 'Incidencias de un técnico' })
    @ApiParam({ name: 'technicianId' })
    async getByTechnician(@Param('technicianId') technicianId: string) {
        return this.monolith.get(`/incidents/technician/${technicianId}`);
    }

    @Get(':id')
    @Permission('incident', 'read')
    @ApiOperation({ summary: 'Obtener incidencia por ID' })
    @ApiParam({ name: 'id' })
    async getOne(@Param('id') id: string) {
        return this.monolith.get(`/incidents/${id}`);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles('employee', 'technician', 'admin', 'super-admin')
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Crear incidencia', description: 'Estado inicial: CREATED.' })
    async create(@Body() dto: CreateIncidentDto) {
        return this.tracing.run('gateway.controller.incidents.create', { kind: 'server' }, () => this._create(dto));
    }
    private async _create(dto: CreateIncidentDto) {
        return this.monolith.post('/incidents', dto);
    }

    @Patch(':id/deliver')
    @Roles('technician', 'admin', 'super-admin')
    @Permission('incident', 'deliver')
    @ApiOperation({ summary: 'Registrar entrega del dispositivo', description: 'Transición CREATED → DELIVERED. Asigna el técnico que recibe el dispositivo.' })
    @ApiParam({ name: 'id' })
    async deliver(@Param('id') id: string, @Body() body: { technicianId: string }) {
        return this.tracing.run('gateway.controller.incidents.deliver', { kind: 'server', attributes: { 'incident.id': id } }, () => this._deliver(id, body));
    }
    private async _deliver(id: string, body: { technicianId: string }) {
        return this.monolith.patch(`/incidents/${id}/deliver`, body);
    }

    @Patch(':id/take')
    @Roles('technician', 'admin', 'super-admin')
    @Permission('incident', 'take')
    @ApiOperation({ summary: 'Tomar incidencia', description: 'Asigna el técnico sin cambiar el estado.' })
    @ApiParam({ name: 'id' })
    async take(@Param('id') id: string, @Body() dto: TakeIncidentDto) {
        return this.tracing.run('gateway.controller.incidents.take', { kind: 'server', attributes: { 'incident.id': id } }, () => this._take(id, dto));
    }
    private async _take(id: string, dto: TakeIncidentDto) {
        return this.monolith.patch(`/incidents/${id}/take`, dto);
    }

    @Patch(':id/release')
    @Roles('technician', 'admin', 'super-admin')
    @Permission('incident', 'release')
    @ApiOperation({ summary: 'Liberar incidencia', description: 'Quita al técnico asignado sin cambiar el estado.' })
    @ApiParam({ name: 'id' })
    async release(@Param('id') id: string, @Body() dto: ReleaseIncidentDto) {
        return this.tracing.run('gateway.controller.incidents.release', { kind: 'server', attributes: { 'incident.id': id } }, () => this._release(id, dto));
    }
    private async _release(id: string, dto: ReleaseIncidentDto) {
        return this.monolith.patch(`/incidents/${id}/release`, dto);
    }

    @Patch(':id/status')
    @Roles('employee', 'technician', 'admin', 'super-admin')
    @Permission('incident', 'change-status')
    @ApiOperation({ summary: 'Cambiar estado', description: 'Transiciones válidas según la máquina de estados (IN_PROGRESS, PENDING_*, CLOSED, etc.).' })
    @ApiParam({ name: 'id' })
    async changeStatus(@Param('id') id: string, @Body() dto: ChangeIncidentStatusDto) {
        return this.tracing.run('gateway.controller.incidents.changeStatus', { kind: 'server', attributes: { 'incident.id': id } }, () => this._changeStatus(id, dto));
    }
    private async _changeStatus(id: string, dto: ChangeIncidentStatusDto) {
        return this.monolith.patch(`/incidents/${id}/status`, dto);
    }

    @Patch(':id/cancel')
    @Roles('employee', 'technician', 'admin', 'super-admin')
    @Permission('incident', 'change-status')
    @ApiOperation({ summary: 'Cancelar incidencia', description: 'El cliente cancela su incidencia. Solo válido desde CREATED → CANCELED.' })
    @ApiParam({ name: 'id' })
    async cancel(@Param('id') id: string, @Body() body: { customerId: string; reason?: string }) {
        return this.tracing.run('gateway.controller.incidents.cancel', { kind: 'server', attributes: { 'incident.id': id } }, () => this._cancel(id, body));
    }
    private async _cancel(id: string, body: { customerId: string; reason?: string }) {
        return this.monolith.patch(`/incidents/${id}/cancel`, body);
    }

    @Patch(':id/validate')
    @Roles('employee', 'technician', 'admin', 'super-admin')
    @Permission('incident', 'validate')
    @ApiOperation({ summary: 'Validar resolución', description: 'El cliente confirma que la incidencia está resuelta. Transición CLOSED → VALIDATED.' })
    @ApiParam({ name: 'id' })
    async validate(@Param('id') id: string, @Body() body: { customerId: string }) {
        return this.tracing.run('gateway.controller.incidents.validate', { kind: 'server', attributes: { 'incident.id': id } }, () => this._validate(id, body));
    }
    private async _validate(id: string, body: { customerId: string }) {
        return this.monolith.patch(`/incidents/${id}/validate`, body);
    }

    @Patch(':id/reopen')
    @Roles('employee', 'technician', 'admin', 'super-admin')
    @Permission('incident', 'reopen')
    @ApiOperation({ summary: 'Reabrir incidencia', description: 'El cliente rechaza la resolución. Transición CLOSED → REOPENED.' })
    @ApiParam({ name: 'id' })
    async reopen(@Param('id') id: string, @Body() body: { customerId: string; reason?: string }) {
        return this.tracing.run('gateway.controller.incidents.reopen', { kind: 'server', attributes: { 'incident.id': id } }, () => this._reopen(id, body));
    }
    private async _reopen(id: string, body: { customerId: string; reason?: string }) {
        return this.monolith.patch(`/incidents/${id}/reopen`, body);
    }

    @Get(':id/timeline')
    @Permission('incident', 'read')
    @ApiOperation({ summary: 'Historial de la incidencia', description: 'Devuelve la línea de tiempo completa de la incidencia ordenada cronológicamente.' })
    @ApiParam({ name: 'id' })
    async getTimeline(@Param('id') id: string) {
        return this.monolith.get(`/incidents/${id}/timeline`);
    }

    @Post(':id/notes')
    @HttpCode(HttpStatus.CREATED)
    @Roles('technician', 'admin', 'super-admin')
    @Permission('incident', 'change-status')
    @ApiOperation({ summary: 'Agregar nota de avance', description: 'Registra una nota sin cambiar el estado de la incidencia.' })
    @ApiParam({ name: 'id' })
    async addNote(@Param('id') id: string, @Body() body: { technicianId?: string; comment: string }) {
        return this.tracing.run('gateway.controller.incidents.addNote', { kind: 'server', attributes: { 'incident.id': id } }, () => this._addNote(id, body));
    }
    private async _addNote(id: string, body: { technicianId?: string; comment: string }) {
        return this.monolith.post(`/incidents/${id}/notes`, body);
    }
}
