// api-gateway/outbound/servicenow/servicenow-outbound.controller.ts
import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    HttpCode,
    HttpStatus,
    Logger,
    Req,
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
 * Proxy HTTP hacia integration-service para operaciones de ServiceNow.
 *
 * Flujo: monolito → gateway (/outbound/servicenow/*) → integration-service (/api/servicenow/*) → api-snowq-service → SN
 *
 * Protegido con @InternalOnly(): requiere Authorization: Bearer <JWT M2M> con type='service'.
 */
@InternalOnly()
@Controller('outbound/servicenow')
export class ServiceNowOutboundController {
    private readonly logger = new Logger(ServiceNowOutboundController.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly config: ConfigService,
        private readonly resilience: OutboundResilienceService,
        private readonly tracing: TracingService,
    ) { }

    private get authHeader(): string {
        return `Bearer ${this.config.get<string>('ABAC_M2M_TOKEN', '')}`;
    }

    private forwardCorrelationId(req: Request): Record<string, string> {
        const cid = req.headers['x-correlation-id'] as string | undefined;
        return cid ? { 'x-correlation-id': cid } : {};
    }

    private get baseHeaders() {
        return { Authorization: this.authHeader };
    }

    @Post('incidents')
    @HttpCode(HttpStatus.CREATED)
    async createIncident(@Body() payload: any, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.sn.createIncident', { kind: 'internal' }, () => this._createIncident(payload, req));
    }
    private async _createIncident(payload: any, req: Request) {
        this.logger.log(`→ createIncident | caller=${payload?.caller_id}`);
        try {
            const data = await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post('/api/servicenow/incidents', payload, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
            this.logger.log(`← createIncident | number=${(data as any)?.number} deferred=${(data as any)?.deferred}`);
            return data;
        } catch (err: any) {
            throw this.toHttpError('createIncident', err);
        }
    }

    @Post('requests')
    @HttpCode(HttpStatus.CREATED)
    async createRequest(@Body() payload: any, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.sn.createRequest', { kind: 'internal' }, () => this._createRequest(payload, req));
    }
    private async _createRequest(payload: any, req: Request) {
        this.logger.log(`→ createRequest | caller=${payload?.caller_id}`);
        try {
            const data = await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post('/api/servicenow/requests', payload, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
            this.logger.log(`← createRequest | number=${(data as any)?.number} deferred=${(data as any)?.deferred}`);
            return data;
        } catch (err: any) {
            throw this.toHttpError('createRequest', err);
        }
    }

    @Post('incidents/enqueue')
    @HttpCode(HttpStatus.ACCEPTED)
    async enqueueIncident(@Body() payload: any, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.sn.enqueueIncident', { kind: 'internal' }, () => this._enqueueIncident(payload, req));
    }
    private async _enqueueIncident(payload: any, req: Request) {
        this.logger.log(`→ enqueueIncident | caller=${payload?.caller_id}`);
        try {
            const data = await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post('/api/servicenow/incidents/enqueue', payload, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
            this.logger.log(`← enqueueIncident | correlationId=${(data as any)?.correlationId}`);
            return data;
        } catch (err: any) {
            throw this.toHttpError('enqueueIncident', err);
        }
    }

    @Post('requests/enqueue')
    @HttpCode(HttpStatus.ACCEPTED)
    async enqueueRequest(@Body() payload: any, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.sn.enqueueRequest', { kind: 'internal' }, () => this._enqueueRequest(payload, req));
    }
    private async _enqueueRequest(payload: any, req: Request) {
        this.logger.log(`→ enqueueRequest | caller=${payload?.caller_id}`);
        try {
            const data = await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post('/api/servicenow/requests/enqueue', payload, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
            this.logger.log(`← enqueueRequest | correlationId=${(data as any)?.correlationId}`);
            return data;
        } catch (err: any) {
            throw this.toHttpError('enqueueRequest', err);
        }
    }

    @Get('reconcile/:correlationId')
    async getReconcileStatus(@Param('correlationId') correlationId: string, @Req() req: Request) {
        this.logger.debug(`→ getReconcileStatus | correlationId=${correlationId}`);
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get(`/api/servicenow/reconcile/${correlationId}`, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            if (err?.response?.status === 404) return null;
            throw this.toHttpError('getReconcileStatus', err);
        }
    }

    @Post('reconcile/:correlationId/retry')
    @HttpCode(HttpStatus.OK)
    async retrySnowqEntry(@Param('correlationId') correlationId: string, @Req() req: Request) {
        return this.tracing.run('gateway.outbound.sn.retrySnowqEntry', { kind: 'internal', attributes: { 'sn.correlationId': correlationId } }, () => this._retrySnowqEntry(correlationId, req));
    }
    private async _retrySnowqEntry(correlationId: string, req: Request) {
        this.logger.log(`→ retrySnowqEntry | correlationId=${correlationId}`);
        try {
            return await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post(`/api/servicenow/reconcile/${correlationId}/retry`, {}, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            throw this.toHttpError('retrySnowqEntry', err);
        }
    }

    @Patch(':table/:sysId')
    async updateTicket(
        @Param('table') table: string,
        @Param('sysId') sysId: string,
        @Body() fields: Record<string, any>,
        @Req() req: Request,
    ) {
        return this.tracing.run('gateway.outbound.sn.updateTicket', { kind: 'internal', attributes: { 'sn.table': table, 'sn.sysId': sysId } }, () => this._updateTicket(table, sysId, fields, req));
    }
    private async _updateTicket(table: string, sysId: string, fields: Record<string, any>, req: Request) {
        this.logger.log(`→ updateTicket | table=${table} sysId=${sysId}`);
        try {
            const data = await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.patch(`/api/servicenow/${table}/${sysId}`, fields, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
            this.logger.log(`← updateTicket OK`);
            return data;
        } catch (err: any) {
            throw this.toHttpError('updateTicket', err);
        }
    }

    @Get('incidents/:sysId/state')
    async getIncidentState(@Param('sysId') sysId: string, @Req() req: Request) {
        this.logger.log(`→ queryIncidentState | sysId=${sysId}`);
        try {
            return await this.resilience.fireRead(() =>
                firstValueFrom(
                    this.httpService.get(`/api/servicenow/incidents/${sysId}/state`, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.readTimeout,
                    }),
                ).then(r => r.data),
            );
        } catch (err: any) {
            if (err?.response?.status === 404) return { state: null };
            throw this.toHttpError('queryIncidentState', err);
        }
    }

    @Post('incidents/:sysId/close')
    @HttpCode(HttpStatus.OK)
    async closeIncident(
        @Param('sysId') sysId: string,
        @Body() body: { closeCategory: string; closeNotes?: string },
        @Req() req: Request,
    ) {
        return this.tracing.run('gateway.outbound.sn.closeIncident', { kind: 'internal', attributes: { 'sn.sysId': sysId } }, () => this._closeIncident(sysId, body, req));
    }
    private async _closeIncident(sysId: string, body: { closeCategory: string; closeNotes?: string }, req: Request) {
        this.logger.log(`→ closeIncident | sysId=${sysId}`);
        try {
            const data = await this.resilience.fireWrite(() =>
                firstValueFrom(
                    this.httpService.post(`/api/servicenow/incidents/${sysId}/close`, body, {
                        headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
                        timeout: this.resilience.writeTimeout,
                    }),
                ).then(r => r.data),
            );
            this.logger.log(`← closeIncident OK`);
            return data;
        } catch (err: any) {
            throw this.toHttpError('closeIncident', err);
        }
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
}
