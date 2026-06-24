// api-gateway/inbound/admin/technicians.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';

@ApiTags('Technicians')
@ApiBearerAuth('jwt')
@Controller('api/admin/technicians')
export class TechniciansController {
    constructor(private readonly monolith: MonolithClient) {}

    /**
     * Lista todos los usuarios activos del monolith — para el picker del modal de técnicos.
     */
    @Get('users')
    @Permission('technician', 'create')
    @ApiOperation({ summary: 'Listar usuarios disponibles para vincular como técnicos' })
    listUsers() {
        return this.monolith.get('/users');
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
        return this.monolith.get(`/users/by-email/${encodeURIComponent(email)}`);
    }

    /**
     * Lista los técnicos de un corner.
     */
    @Get()
    @Permission('technician', 'list')
    @ApiOperation({ summary: 'Listar técnicos. Sin cornerId devuelve todos.' })
    @ApiQuery({ name: 'cornerId', required: false })
    list(@Query('cornerId') cornerId?: string) {
        return this.monolith.get('/technicians', cornerId ? { cornerId } : {});
    }

    /**
     * Crea un técnico vinculado a un User existente del monolith.
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
        return this.monolith.post('/technicians', dto);
    }

    /**
     * Obtener técnico por ID.
     */
    @Get(':id')
    @Permission('technician', 'read')
    @ApiOperation({ summary: 'Obtener técnico por ID' })
    @ApiParam({ name: 'id' })
    getOne(@Param('id') id: string) {
        return this.monolith.get(`/technicians/${id}`);
    }

    /**
     * Asignar técnico a un corner (transferencia entre corners).
     */
    @Patch(':id/corner')
    @Permission('technician', 'update')
    @ApiOperation({ summary: 'Asignar técnico a un corner' })
    @ApiParam({ name: 'id' })
    assignCorner(@Param('id') id: string, @Body() dto: { cornerId: string }) {
        return this.monolith.patch(`/technicians/${id}/corner`, dto);
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
        return this.monolith.delete(`/technicians/${id}`);
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
        return this.monolith.patch(`/technicians/${id}/disable`, {});
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
        return this.monolith.patch(`/technicians/${id}/enable`, {});
    }
}
