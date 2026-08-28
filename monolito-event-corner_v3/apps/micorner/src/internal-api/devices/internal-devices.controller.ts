// internal-api/devices/internal-devices.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody,
    ApiBearerAuth } from '@nestjs/swagger';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { DEVICE_SERVICE, IDeviceService } from '../../core/ports';
import { DeviceId } from '@app/shared/types/branded-ids';
import { Device } from '../../core/domain/entities/device.entity';
import { TracingService } from '@app/observability';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('internal/devices')
export class InternalDevicesController {
    constructor(
        @Inject(DEVICE_SERVICE) private readonly service: IDeviceService,
        private readonly tracing: TracingService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Listar dispositivos virtuales de un usuario' })
    @ApiQuery({ name: 'userId', required: true })
    @ApiResponse({ status: 200, description: 'Lista de dispositivos virtuales del usuario' })
    async listByUser(@Query('userId') userId: string) {
        const devices = unwrapOrThrow(await this.service.getDevicesByUser(userId));
        return devices.map((d) => ({
            id: d.id.toString(),
            serialNumber: d.serialNumber.value,
            model: d.model,
            brand: d.brand,
            deviceType: d.deviceType,
            status: d.status,
            isVirtual: d.isVirtual,
        }));
    }

    @Get(':serialNumber/resolve')
    @ApiOperation({ summary: 'Resolver dispositivo por número de serie', description: 'Busca el dispositivo en el inventario local. Si no existe, puede crearlo como virtual.' })
    @ApiParam({ name: 'serialNumber', example: 'SN-ABC-123456' })
    @ApiResponse({ status: 200, description: 'Dispositivo resuelto (puede ser null si no se encuentra)' })
    async resolve(@Param('serialNumber') serialNumber: string) {
        return unwrapOrThrow(await this.service.resolveDevice(serialNumber));
    }

    @Post(':serialNumber/sync')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Sincronizar dispositivo con inventario externo', description: 'Fuerza la sincronización de un dispositivo con Minerva (inventario externo).' })
    @ApiParam({ name: 'serialNumber', example: 'SN-ABC-123456' })
    @ApiResponse({ status: 200, description: 'Resultado de la sincronización' })
    async sync(@Param('serialNumber') serialNumber: string) {
        return this.tracing.run('micorner.controller.devices.sync', { kind: 'server', attributes: { 'device.serialNumber': serialNumber } }, () => this._sync(serialNumber));
    }

    private async _sync(serialNumber: string) {
        return unwrapOrThrow(await this.service.syncDevice(serialNumber));
    }

    @Post('sync-for-user/:userId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Sincronizar dispositivos de un usuario desde Minerva', description: 'Trae todos los dispositivos asignados al usuario en Minerva y los upsertea en la DB local. Usado on-demand en el login.' })
    @ApiParam({ name: 'userId', description: 'ID del usuario en el micorner' })
    @ApiResponse({ status: 200, description: 'Resultado de la sincronización' })
    async syncForUser(@Param('userId') userId: string) {
        return this.tracing.run('micorner.controller.devices.syncForUser', { kind: 'server', attributes: { 'user.id': userId } }, () => this._syncForUser(userId));
    }

    private async _syncForUser(userId: string) {
        return unwrapOrThrow(await this.service.syncUserDevices(userId));
    }

    @Post('refresh-stale')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Refrescar dispositivos desactualizados', description: 'Busca todos los dispositivos con estado STALE y los re-sincroniza con el inventario externo.' })
    @ApiResponse({ status: 200, description: 'Resultado del proceso de refresco' })
    async refreshStale() {
        return this.tracing.run('micorner.controller.devices.refreshStale', { kind: 'server' }, () => this._refreshStale());
    }

    private async _refreshStale() {
        return unwrapOrThrow(await this.service.refreshStaleDevices());
    }

    @Post('virtual')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear dispositivo virtual' })
    @ApiBody({ schema: { properties: { userId: { type: 'string' }, deviceType: { type: 'string' }, model: { type: 'string' }, serialNumber: { type: 'string' } }, required: ['userId', 'deviceType'] } })
    @ApiResponse({ status: 201, description: 'Dispositivo virtual creado' })
    async createVirtual(@Body() body: { userId: string; deviceType: string; model?: string; serialNumber?: string }) {
        return this.tracing.run('micorner.controller.devices.createVirtual', { kind: 'server' }, () => this._createVirtual(body));
    }

    private async _createVirtual(body: { userId: string; deviceType: string; model?: string; serialNumber?: string }) {
        const device = unwrapOrThrow(await this.service.createVirtualDevice(body.userId, body.deviceType, body.model, body.serialNumber));
        return this.mapDevice(device);
    }

    @Patch('virtual/:deviceId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Editar dispositivo virtual' })
    @ApiParam({ name: 'deviceId' })
    @ApiBody({ schema: { properties: { serialNumber: { type: 'string' }, deviceType: { type: 'string' }, model: { type: 'string' }, brand: { type: 'string' } } } })
    @ApiResponse({ status: 200, description: 'Dispositivo virtual actualizado' })
    async updateVirtual(
        @Param('deviceId') deviceId: string,
        @Body() body: { serialNumber?: string; deviceType?: string; model?: string | null; brand?: string | null },
    ) {
        return this.tracing.run('micorner.controller.devices.updateVirtual', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._updateVirtual(deviceId, body));
    }

    private async _updateVirtual(deviceId: string, body: { serialNumber?: string; deviceType?: string; model?: string | null; brand?: string | null }) {
        const device = unwrapOrThrow(await this.service.updateVirtualDevice(deviceId as unknown as DeviceId, body));
        return this.mapDevice(device);
    }

    @Post(':deviceId/disable')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Deshabilitar dispositivo' })
    @ApiParam({ name: 'deviceId' })
    @ApiResponse({ status: 200, description: 'Dispositivo deshabilitado' })
    async disableDevice(@Param('deviceId') deviceId: string) {
        return this.tracing.run('micorner.controller.devices.disableDevice', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._disableDevice(deviceId));
    }

    private async _disableDevice(deviceId: string) {
        unwrapOrThrow(await this.service.disableDevice(deviceId as unknown as DeviceId));
        return { disabled: true };
    }

    @Post(':deviceId/enable')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Habilitar dispositivo deshabilitado' })
    @ApiParam({ name: 'deviceId' })
    @ApiResponse({ status: 200, description: 'Dispositivo habilitado' })
    async enableDevice(@Param('deviceId') deviceId: string) {
        return this.tracing.run('micorner.controller.devices.enableDevice', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._enableDevice(deviceId));
    }

    private async _enableDevice(deviceId: string) {
        unwrapOrThrow(await this.service.enableDevice(deviceId as unknown as DeviceId));
        return { enabled: true };
    }

    @Delete('virtual/:deviceId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Eliminar dispositivo virtual' })
    @ApiParam({ name: 'deviceId' })
    @ApiResponse({ status: 200, description: 'Dispositivo virtual eliminado' })
    async deleteVirtual(@Param('deviceId') deviceId: string) {
        return this.tracing.run('micorner.controller.devices.deleteVirtual', { kind: 'server', attributes: { 'device.id': deviceId } }, () => this._deleteVirtual(deviceId));
    }

    private async _deleteVirtual(deviceId: string) {
        unwrapOrThrow(await this.service.completeVirtualDevice(deviceId as unknown as DeviceId));
        return { deleted: true };
    }

    private mapDevice(device: Device) {
        return {
            id: device.id.toString(),
            serialNumber: device.serialNumber.value,
            model: device.model,
            brand: device.brand,
            deviceType: device.deviceType,
            status: device.status,
            isVirtual: device.isVirtual,
        };
    }
}
