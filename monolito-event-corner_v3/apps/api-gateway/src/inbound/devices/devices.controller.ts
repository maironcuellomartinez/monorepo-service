// api-gateway/inbound/devices/devices.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';

@ApiTags('Devices')
@ApiBearerAuth('jwt')
@Controller('api/devices')
export class DevicesController {
    constructor(private readonly monolith: MonolithClient) {}

    @Get()
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Listar dispositivos de un usuario (desde DB local)' })
    @ApiQuery({ name: 'userId', required: true })
    listByUser(@Query('userId') userId: string) {
        return this.monolith.get('/devices', { userId });
    }

    @Post('sync-user/:userId')
    @HttpCode(HttpStatus.OK)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Sincronizar dispositivos de un usuario desde Minerva', description: 'Trae los dispositivos del usuario desde el inventario externo (Minerva) y los upsertea en la DB local.' })
    @ApiParam({ name: 'userId', description: 'ID del usuario en el monolith' })
    syncForUser(@Param('userId') userId: string) {
        return this.monolith.post(`/devices/sync-for-user/${userId}`, {});
    }

    @Post('virtual')
    @HttpCode(HttpStatus.CREATED)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Crear dispositivo virtual para un usuario' })
    @ApiBody({ schema: { properties: { userId: { type: 'string' }, deviceType: { type: 'string' }, model: { type: 'string' }, serialNumber: { type: 'string' } }, required: ['userId', 'deviceType'] } })
    createVirtual(@Body() body: { userId: string; deviceType: string; model?: string; serialNumber?: string }) {
        return this.monolith.post('/devices/virtual', body);
    }

    @Patch('virtual/:deviceId')
    @HttpCode(HttpStatus.OK)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Editar dispositivo virtual' })
    @ApiParam({ name: 'deviceId' })
    @ApiBody({ schema: { properties: { serialNumber: { type: 'string' }, deviceType: { type: 'string' }, model: { type: 'string' }, brand: { type: 'string' } } } })
    updateVirtual(@Param('deviceId') deviceId: string, @Body() body: object) {
        return this.monolith.patch(`/devices/virtual/${deviceId}`, body);
    }

    @Post(':deviceId/disable')
    @HttpCode(HttpStatus.OK)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Deshabilitar dispositivo' })
    @ApiParam({ name: 'deviceId' })
    disableDevice(@Param('deviceId') deviceId: string) {
        return this.monolith.post(`/devices/${deviceId}/disable`, {});
    }

    @Post(':deviceId/enable')
    @HttpCode(HttpStatus.OK)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Habilitar dispositivo deshabilitado' })
    @ApiParam({ name: 'deviceId' })
    enableDevice(@Param('deviceId') deviceId: string) {
        return this.monolith.post(`/devices/${deviceId}/enable`, {});
    }

    @Delete('virtual/:deviceId')
    @HttpCode(HttpStatus.OK)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Eliminar dispositivo virtual' })
    @ApiParam({ name: 'deviceId' })
    deleteVirtual(@Param('deviceId') deviceId: string) {
        return this.monolith.delete(`/devices/virtual/${deviceId}`);
    }
}
