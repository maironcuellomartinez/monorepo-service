// api-gateway/inbound/devices/devices.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { TracingService } from '@app/observability';

@ApiTags('Devices')
@ApiBearerAuth('jwt')
@Controller('api/devices')
export class DevicesController {
    constructor(
        private readonly monolith: MonolithClient,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @Permission('device', 'read')
    @ApiOperation({ summary: 'Listar dispositivos de un usuario (desde DB local)' })
    @ApiQuery({ name: 'userId', required: true })
    listByUser(@Query('userId') userId: string) {
        return this.monolith.get('/devices', { userId });
    }

    @Post('sync-user/:userId')
    @HttpCode(HttpStatus.OK)
    @Permission('device', 'sync')
    @ApiOperation({ summary: 'Sincronizar dispositivos de un usuario desde Minerva', description: 'Trae los dispositivos del usuario desde el inventario externo (Minerva) y los upsertea en la DB local.' })
    @ApiParam({ name: 'userId', description: 'ID del usuario en el monolith' })
    syncForUser(@Param('userId') userId: string) {
        return this.tracing.run('gateway.controller.devices.syncForUser', { kind: 'server', attributes: { 'user.id': userId } }, () => this._syncForUser(userId));
    }
    private async _syncForUser(userId: string) {
        return this.monolith.post(`/devices/sync-for-user/${userId}`, {});
    }

    @Post('virtual')
    @HttpCode(HttpStatus.CREATED)
    @Permission('device', 'create-virtual')
    @ApiOperation({ summary: 'Crear dispositivo virtual para un usuario' })
    @ApiBody({ schema: { properties: { userId: { type: 'string' }, deviceType: { type: 'string' }, model: { type: 'string' }, serialNumber: { type: 'string' } }, required: ['userId', 'deviceType'] } })
    createVirtual(@Body() body: { userId: string; deviceType: string; model?: string; serialNumber?: string }) {
        return this.tracing.run('gateway.controller.devices.createVirtual', { kind: 'server' }, () => this._createVirtual(body));
    }
    private async _createVirtual(body: { userId: string; deviceType: string; model?: string; serialNumber?: string }) {
        return this.monolith.post('/devices/virtual', body);
    }

    @Patch('virtual/:deviceId')
    @HttpCode(HttpStatus.OK)
    @Permission('device', 'create-virtual')
    @ApiOperation({ summary: 'Editar dispositivo virtual' })
    @ApiParam({ name: 'deviceId' })
    @ApiBody({ schema: { properties: { serialNumber: { type: 'string' }, deviceType: { type: 'string' }, model: { type: 'string' }, brand: { type: 'string' } } } })
    updateVirtual(@Param('deviceId') deviceId: string, @Body() body: object) {
        return this.tracing.run('gateway.controller.devices.updateVirtual', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._updateVirtual(deviceId, body));
    }
    private async _updateVirtual(deviceId: string, body: object) {
        return this.monolith.patch(`/devices/virtual/${deviceId}`, body);
    }

    @Post(':deviceId/disable')
    @HttpCode(HttpStatus.OK)
    @Permission('device', 'sync')
    @ApiOperation({ summary: 'Deshabilitar dispositivo' })
    @ApiParam({ name: 'deviceId' })
    disableDevice(@Param('deviceId') deviceId: string) {
        return this.tracing.run('gateway.controller.devices.disableDevice', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._disableDevice(deviceId));
    }
    private async _disableDevice(deviceId: string) {
        return this.monolith.post(`/devices/${deviceId}/disable`, {});
    }

    @Post(':deviceId/enable')
    @HttpCode(HttpStatus.OK)
    @Permission('device', 'sync')
    @ApiOperation({ summary: 'Habilitar dispositivo deshabilitado' })
    @ApiParam({ name: 'deviceId' })
    enableDevice(@Param('deviceId') deviceId: string) {
        return this.tracing.run('gateway.controller.devices.enableDevice', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._enableDevice(deviceId));
    }
    private async _enableDevice(deviceId: string) {
        return this.monolith.post(`/devices/${deviceId}/enable`, {});
    }

    @Delete('virtual/:deviceId')
    @HttpCode(HttpStatus.OK)
    @Permission('device', 'create-virtual')
    @ApiOperation({ summary: 'Eliminar dispositivo virtual' })
    @ApiParam({ name: 'deviceId' })
    deleteVirtual(@Param('deviceId') deviceId: string) {
        return this.tracing.run('gateway.controller.devices.deleteVirtual', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._deleteVirtual(deviceId));
    }
    private async _deleteVirtual(deviceId: string) {
        return this.monolith.delete(`/devices/virtual/${deviceId}`);
    }
}
