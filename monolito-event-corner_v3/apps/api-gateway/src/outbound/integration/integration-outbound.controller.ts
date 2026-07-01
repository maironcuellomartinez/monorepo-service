import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    Req,
    HttpCode,
    HttpStatus,
    Logger,
    BadGatewayException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';
import { InternalOnly } from '../../auth/decorators/internal.decorator';
import { OutboundResilienceService } from '../outbound-resilience.service';
import { TracingService } from '@app/observability';

/**
 * Proxy HTTP hacia integration-service.
 * Reenvía todas las operaciones de integración (appointments, Minerva, Droppoint)
 * añadiendo autenticación interna.
 *
 * Protegido con @InternalOnly(): solo el monolito puede llamar estos endpoints.
 */
@InternalOnly()
@Controller('outbound/integration')
export class IntegrationOutboundController {
    private readonly logger = new Logger(IntegrationOutboundController.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        private readonly resilience: OutboundResilienceService,
        private readonly tracing: TracingService,
    ) { }

    private get authHeaders() {
        return { 'Authorization': `Bearer ${this.configService.get<string>('ABAC_M2M_TOKEN', '')}` };
    }

    private forwardCorrelationId(req: Request): Record<string, string> {
        const correlationId = req.headers['x-correlation-id'] as string;
        return correlationId ? { 'x-correlation-id': correlationId } : {};
    }

    private mergedHeaders(req: Request) {
        return { ...this.authHeaders, ...this.forwardCorrelationId(req) };
    }

    private toHttpError(method: string, err: any): BadGatewayException {
        const msg: string =
            err?.response?.data?.message ??
            err?.response?.data?.error ??
            err?.message ??
            String(err);
        this.logger.error(`${method} → integration-service failed: ${msg}`);
        return new BadGatewayException(msg);
    }

    // ── Appointments ──────────────────────────────────────────────────────────

    @Post('appointments')
    @HttpCode(HttpStatus.OK)
    async processAppointment(@Body() body: any, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.integration.processAppointment', { kind: 'internal' }, () => this._processAppointment(body, req));
    }
    private async _processAppointment(body: any, req: Request) {
        this.logger.log(`→ processAppointment | eventType=${body?.eventType} | correlationId=${body?.correlationId}`);
        try {
            const data = await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post('/api/v1/integration/appointments', body, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
            this.logger.log(`← processAppointment | status=${(data as any)?.status}`);
            return data;
        } catch (err: any) {
            throw this.toHttpError('processAppointment', err);
        }
    }

    @Get('status/:id')
    async getIntegrationStatus(@Param('id') id: string, @Req() req: Request) {
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get(`/api/v1/integration/${id}`, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('getIntegrationStatus', err);
        }
    }

    @Get('status/correlation/:correlationId')
    async getIntegrationByCorrelation(
        @Param('correlationId') correlationId: string,
        @Req() req: Request,
    ) {
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get(`/api/v1/integration/correlation/${correlationId}`, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('getIntegrationByCorrelation', err);
        }
    }

    // ── Minerva ───────────────────────────────────────────────────────────────

    @Get('minerva/devices')
    async listMinervaDevices(
        @Query('deviceType') deviceType: string,
        @Query('cornerId') cornerId: string,
        @Req() req: Request,
    ) {
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get('/api/v1/minerva/devices', {
                        params: { deviceType, cornerId },
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('listMinervaDevices', err);
        }
    }

    @Get('minerva/devices/:serial')
    async getMinervaDevice(@Param('serial') serial: string, @Req() req: Request) {
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get(`/api/v1/minerva/devices/${serial}`, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('getMinervaDevice', err);
        }
    }

    @Post('minerva/devices/:serial/assign')
    @HttpCode(HttpStatus.OK)
    async assignMinervaDevice(
        @Param('serial') serial: string,
        @Body() body: any,
        @Req() req: Request,
    ) {
        return this.tracing.run('gateway.outbound.integration.assignMinervaDevice', { kind: 'internal', attributes: { 'device.serial': serial } }, () => this._assignMinervaDevice(serial, body, req));
    }
    private async _assignMinervaDevice(serial: string, body: any, req: Request) {
        try {
            return await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post(`/api/v1/minerva/devices/${serial}/assign`, body, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('assignMinervaDevice', err);
        }
    }

    @Post('minerva/devices/:serial/release')
    @HttpCode(HttpStatus.OK)
    async releaseMinervaDevice(
        @Param('serial') serial: string,
        @Body() body: any,
        @Req() req: Request,
    ) {
        return this.tracing.run('gateway.outbound.integration.releaseMinervaDevice', { kind: 'internal', attributes: { 'device.serial': serial } }, () => this._releaseMinervaDevice(serial, body, req));
    }
    private async _releaseMinervaDevice(serial: string, body: any, req: Request) {
        try {
            return await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post(`/api/v1/minerva/devices/${serial}/release`, body, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('releaseMinervaDevice', err);
        }
    }

    @Post('minerva/devices/:serial/sync')
    @HttpCode(HttpStatus.OK)
    async syncMinervaDevice(@Param('serial') serial: string, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.integration.syncMinervaDevice', { kind: 'internal', attributes: { 'device.serial': serial } }, () => this._syncMinervaDevice(serial, req));
    }
    private async _syncMinervaDevice(serial: string, req: Request) {
        try {
            return await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post(
                        `/api/v1/minerva/devices/${serial}/sync`,
                        {},
                        { headers: this.mergedHeaders(req), timeout: this.resilience.writeTimeout },
                    ),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('syncMinervaDevice', err);
        }
    }

    // ── Droppoint ─────────────────────────────────────────────────────────────

    @Get('droppoint/boxes/free')
    async getDroppointFreeBoxes(
        @Query('machineRef') machineRef: string,
        @Req() req: Request,
    ) {
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get('/api/v1/droppoint/boxes/free', {
                        params: { machineRef },
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('getDroppointFreeBoxes', err);
        }
    }

    @Get('droppoint/shipments/:externalId')
    async getDroppointShipment(
        @Param('externalId') externalId: string,
        @Req() req: Request,
    ) {
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get(`/api/v1/droppoint/shipments/${externalId}`, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('getDroppointShipment', err);
        }
    }

    @Post('droppoint/shipments')
    @HttpCode(HttpStatus.OK)
    async createDroppointShipment(@Body() body: any, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.integration.createDroppointShipment', { kind: 'internal' }, () => this._createDroppointShipment(body, req));
    }
    private async _createDroppointShipment(body: any, req: Request) {
        try {
            return await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post('/api/v1/droppoint/shipments', body, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('createDroppointShipment', err);
        }
    }

    @Patch('droppoint/shipments/state')
    async updateDroppointShipmentState(@Body() body: any, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.integration.updateDroppointShipmentState', { kind: 'internal' }, () => this._updateDroppointShipmentState(body, req));
    }
    private async _updateDroppointShipmentState(body: any, req: Request) {
        try {
            return await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.patch('/api/v1/droppoint/shipments/state', body, {
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('updateDroppointShipmentState', err);
        }
    }

    @Delete('droppoint/shipments/:externalId')
    @HttpCode(HttpStatus.OK)
    async cancelDroppointShipment(
        @Param('externalId') externalId: string,
        @Query('machineRef') machineRef: string,
        @Req() req: Request,
    ) {
        return this.tracing.run('gateway.outbound.integration.cancelDroppointShipment', { kind: 'internal', attributes: { 'shipment.externalId': externalId } }, () => this._cancelDroppointShipment(externalId, machineRef, req));
    }
    private async _cancelDroppointShipment(externalId: string, machineRef: string, req: Request) {
        try {
            return await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.delete(`/api/v1/droppoint/shipments/${externalId}`, {
                        params: { machineRef },
                        headers: this.mergedHeaders(req),
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('cancelDroppointShipment', err);
        }
    }
}
