// api-gateway/inbound/admin/technicians.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MicornerClient } from '../../client/micorner.client';
import { AbacClient } from '../../auth/abac.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { TracingService } from '@app/observability';

@ApiTags('Technicians')
@ApiBearerAuth('jwt')
@Controller('api/admin/technicians')
export class TechniciansController {
    constructor(
        private readonly micorner: MicornerClient,
        private readonly abac: AbacClient,
        private readonly tracing: TracingService,
    ) {}

    /**
     * Lista todos los usuarios activos del micorner — para el picker del modal de técnicos.
     */
    @Get('users')
    @Permission('technician', 'create')
    @ApiOperation({ summary: 'Listar usuarios disponibles para vincular como técnicos' })
    listUsers() {
        return this.micorner.get('/users');
    }

    /**
     * Buscar un usuario por email (búsqueda puntual).
     * Devuelve 404 si el usuario no existe o nunca hizo login.
     */
    @Get('lookup-user')
    @Permission('technician', 'create')
    @ApiOperation({ summary: 'Buscar usuario por email para vincularlo como técnico' })
    @ApiQuery({ name: 'email', required: true })
    lookupUser(@Query('email') email: string) {
        return this.micorner.get(`/users/by-email/${encodeURIComponent(email)}`);
    }

    /**
     * Lista los técnicos de un corner.
     */
    @Get()
    @Permission('technician', 'list')
    @ApiOperation({ summary: 'Listar técnicos. Sin cornerId devuelve todos.' })
    @ApiQuery({ name: 'cornerId', required: false })
    list(@Query('cornerId') cornerId?: string) {
        return this.micorner.get('/technicians', cornerId ? { cornerId } : {});
    }

    /**
     * Crea un técnico vinculado a un User existente del micorner.
     * El admin selecciona un User (que ya hizo login) y le asigna un corner.
     * Los datos de nombre/email se envían explícitamente desde el frontend
     * (ya los tiene porque los leyó de /auth/me o de la lista de usuarios).
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Permission('technician', 'create')
    @ApiOperation({ summary: 'Crear técnico vinculado a un User' })
    create(@Body() dto: {
        userId: string;
        name: string;
        email: string;
        cornerId?: string;
        lastName?: string;
    }) {
        return this.tracing.run('gateway.controller.technicians.create', { kind: 'server' }, () => this._create(dto));
    }
    private async _create(dto: {
        userId: string;
        name: string;
        email: string;
        cornerId?: string;
        lastName?: string;
    }) {
        // El rol técnico se otorga en ABAC, no acá — solo verificamos que ya lo tenga
        // antes de crear el vínculo operativo (corner/horario) en el micorner.
        const micornerUser = await this.micorner.get<{ externalId: string }>(`/users/${dto.userId}`);
        const hasTechnicianRole = await this.abac.canAccess(micornerUser.externalId, 'dashboard-technician', 'read');
        if (!hasTechnicianRole) {
            throw new ForbiddenException(
                'El usuario no tiene el rol "technician" en ABAC. Asignale el rol antes de promoverlo.',
            );
        }
        return this.micorner.post('/technicians', dto);
    }

    /**
     * Obtener técnico por ID.
     */
    @Get(':id')
    @Permission('technician', 'read')
    @ApiOperation({ summary: 'Obtener técnico por ID' })
    @ApiParam({ name: 'id' })
    getOne(@Param('id') id: string) {
        return this.micorner.get(`/technicians/${id}`);
    }

    /**
     * Asignar técnico a un corner (transferencia entre corners).
     */
    @Patch(':id/corner')
    @Permission('technician', 'update')
    @ApiOperation({ summary: 'Asignar técnico a un corner' })
    @ApiParam({ name: 'id' })
    assignCorner(@Param('id') id: string, @Body() dto: { cornerId: string }) {
        return this.tracing.run('gateway.controller.technicians.assignCorner', { kind: 'server', attributes: { 'technician.id': id } }, () => this._assignCorner(id, dto));
    }
    private async _assignCorner(id: string, dto: { cornerId: string }) {
        return this.micorner.patch(`/technicians/${id}/corner`, dto);
    }

    /**
     * Eliminar técnico permanentemente.
     */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Permission('technician', 'delete')
    @ApiOperation({ summary: 'Eliminar técnico' })
    @ApiParam({ name: 'id' })
    remove(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.technicians.remove', { kind: 'server', attributes: { 'technician.id': id } }, () => this._remove(id));
    }
    private async _remove(id: string) {
        return this.micorner.delete(`/technicians/${id}`);
    }

    /**
     * Deshabilitar técnico (soft disable).
     */
    @Patch(':id/disable')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Permission('technician', 'update')
    @ApiOperation({ summary: 'Deshabilitar técnico' })
    @ApiParam({ name: 'id' })
    disable(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.technicians.disable', { kind: 'server', attributes: { 'technician.id': id } }, () => this._disable(id));
    }
    private async _disable(id: string) {
        return this.micorner.patch(`/technicians/${id}/disable`, {});
    }

    /**
     * Habilitar técnico.
     */
    @Patch(':id/enable')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Permission('technician', 'update')
    @ApiOperation({ summary: 'Habilitar técnico' })
    @ApiParam({ name: 'id' })
    enable(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.technicians.enable', { kind: 'server', attributes: { 'technician.id': id } }, () => this._enable(id));
    }
    private async _enable(id: string) {
        return this.micorner.patch(`/technicians/${id}/enable`, {});
    }
}
