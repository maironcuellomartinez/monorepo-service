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

/** Prefijo para distinguir correlationIds generados por snowq de otros IDs del ecosistema. */
const SNOWQ_PREFIX = 'snowq:';

/**
 * Proxy HTTP hacia api-snowq-service para operaciones de ServiceNow.
 *
 * Flujo: monolito → gateway (/outbound/servicenow/*) → api-snowq-service (/snow-requests/*) → SN
 * Único egress hacia ServiceNow del ecosistema — integration-service ya no interviene acá.
 *
 * Creación de tickets: dos fases contra api-snowq-service
 *   1. INMEDIATO  — respuesta síncrona con sys_id + snowNumber
 *   2. ASYNC      — fallback a cola del broker (deferred=true)
 *
 * Protegido con @InternalOnly(): requiere Authorization: Bearer <JWT M2M> con type='service'.
 * El mismo token (ABAC_M2M_TOKEN) es el que valida api-snowq-service vía M2mJwtGuard.
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
  ) {}

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

  /** Agrega el prefijo 'snowq:' para distinguir correlationIds de snowq. */
  private prefixCorrelationId(correlationId: string): string {
    return `${SNOWQ_PREFIX}${correlationId}`;
  }

  /** Quita el prefijo 'snowq:' antes de llamar a api-snowq-service. */
  private stripCorrelationPrefix(prefixed: string): string {
    return prefixed.startsWith(SNOWQ_PREFIX)
      ? prefixed.slice(SNOWQ_PREFIX.length)
      : prefixed;
  }

  private buildIncidentBody(payload: Record<string, any>) {
    // Clasificación SN provista por el monolith (desde el IssueType). Fallback a
    // los valores neutros previos por robustez (si el emisor no los envía).
    const severity = payload.severity ?? 'medium';
    const impact = payload.impact ?? 2;
    const urgency = payload.urgency ?? 2;
    return {
      // Top-level: requerido por BaseSnowRequestDto (validación) del api-snowq-service.
      severity,
      impact,
      urgency,
      // priority es el ORDEN DE COLA (bulkhead/reintentos), no la clasificación SN.
      priority: 2,
      source: 'event-corner',
      payload: {
        short_description: payload.short_description,
        description: payload.description,
        assignmentGroup: payload.assignment_group,
        caller_id: payload.caller_id,
        assigned_to: payload.assigned_to,
        category: payload.category,
        company: payload.company,
        location: payload.location,
        expected_start: payload.expected_start,
        // snowq (buildPayloadForServiceNow) lee la clasificación DESDE payload.
        urgency,
        impact,
        severity,
        // Identidad para deduplicación en snowq (ver computeFingerprint en api-snowq-service).
        externalId: payload.externalId,
      },
    };
  }

  private buildRequestBody(payload: Record<string, any>) {
    return {
      severity: 'low',
      impact: 1,
      urgency: 1,
      priority: 1,
      source: 'event-corner',
      payload: {
        short_description: payload.short_description,
        description: payload.description,
        assignmentGroup: payload.assignment_group,
        caller_id: payload.caller_id,
        requested_for: payload.requested_for,
        category: payload.category,
        company: payload.company,
        location: payload.location,
        externalId: payload.externalId,
      },
    };
  }

  @Post('incidents')
  @HttpCode(HttpStatus.CREATED)
  async createIncident(@Body() payload: any, @Req() req: Request) {
    return this.tracing.run(
      'gateway.outbound.sn.createIncident',
      { kind: 'internal' },
      () => this._createIncident(payload, req),
    );
  }
  private async _createIncident(payload: any, req: Request) {
    this.logger.log(`→ createIncident | caller=${payload?.caller_id}`);
    const body = this.buildIncidentBody(payload);
    const headers = { ...this.baseHeaders, ...this.forwardCorrelationId(req) };

    // Phase 1 — immediate (sync). Breaker propio: un 5xx acá es esperado (cae a fallback)
    // y no debe abrir el circuito que protege la fase async / update / close / reconcile.
    try {
      const data = await this.resilience.fireImmediate(() =>
        firstValueFrom(
          this.httpService.post('/snow-requests/immediate/incidents', body, {
            headers,
            timeout: this.resilience.writeTimeout,
          }),
        ).then((r) => r.data),
      );
      const sysId = data?.sys_id;
      const number = data?.snowNumber;
      if (!sysId || !number)
        throw new Error(
          `Unexpected immediate response: ${JSON.stringify(data)}`,
        );
      this.logger.log(
        `← createIncident IMMEDIATE | number=${number} sysId=${sysId}`,
      );
      return { sysId, number, deferred: false };
    } catch (immediateErr: any) {
      this.logger.warn(
        `createIncident: immediate failed (${immediateErr?.message}) — fallback async`,
      );
    }

    // Phase 2 — async queue fallback
    try {
      const data = await this.resilience.fireWrite(() =>
        firstValueFrom(
          this.httpService.post('/snow-requests/incidents', body, {
            headers,
            timeout: this.resilience.writeTimeout,
          }),
        ).then((r) => r.data),
      );
      const correlationId = data?.correlationId;
      const internalNumber = data?.internalNumber;
      if (!correlationId)
        throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
      const prefixed = this.prefixCorrelationId(correlationId);
      this.logger.log(
        `← createIncident ASYNC | correlationId=${prefixed} internalNumber=${internalNumber}`,
      );
      return {
        sysId: '',
        number: internalNumber ?? '',
        deferred: true,
        correlationId: prefixed,
      };
    } catch (asyncErr: any) {
      throw this.toHttpError('createIncident', asyncErr);
    }
  }

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async createRequest(@Body() payload: any, @Req() req: Request) {
    return this.tracing.run(
      'gateway.outbound.sn.createRequest',
      { kind: 'internal' },
      () => this._createRequest(payload, req),
    );
  }
  private async _createRequest(payload: any, req: Request) {
    this.logger.log(`→ createRequest | caller=${payload?.caller_id}`);
    const body = this.buildRequestBody(payload);
    const headers = { ...this.baseHeaders, ...this.forwardCorrelationId(req) };

    // Phase 1 — immediate (sync). Breaker propio, ver comentario análogo en _createIncident.
    try {
      const data = await this.resilience.fireImmediate(() =>
        firstValueFrom(
          this.httpService.post(
            '/snow-requests/immediate/service-catalog',
            body,
            { headers, timeout: this.resilience.writeTimeout },
          ),
        ).then((r) => r.data),
      );
      const sysId = data?.sys_id;
      const number = data?.snowNumber;
      if (!sysId || !number)
        throw new Error(
          `Unexpected immediate response: ${JSON.stringify(data)}`,
        );
      this.logger.log(
        `← createRequest IMMEDIATE | number=${number} sysId=${sysId}`,
      );
      return { sysId, number, deferred: false };
    } catch (immediateErr: any) {
      this.logger.warn(
        `createRequest: immediate failed (${immediateErr?.message}) — fallback async`,
      );
    }

    // Phase 2 — async queue fallback
    try {
      const data = await this.resilience.fireWrite(() =>
        firstValueFrom(
          this.httpService.post('/snow-requests/service-catalog', body, {
            headers,
            timeout: this.resilience.writeTimeout,
          }),
        ).then((r) => r.data),
      );
      const correlationId = data?.correlationId;
      const internalNumber = data?.internalNumber;
      if (!correlationId)
        throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
      const prefixed = this.prefixCorrelationId(correlationId);
      this.logger.log(
        `← createRequest ASYNC | correlationId=${prefixed} internalNumber=${internalNumber}`,
      );
      return {
        sysId: '',
        number: internalNumber ?? '',
        deferred: true,
        correlationId: prefixed,
      };
    } catch (asyncErr: any) {
      throw this.toHttpError('createRequest', asyncErr);
    }
  }

  @Post('incidents/enqueue')
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueueIncident(@Body() payload: any, @Req() req: Request) {
    return this.tracing.run(
      'gateway.outbound.sn.enqueueIncident',
      { kind: 'internal' },
      () => this._enqueueIncident(payload, req),
    );
  }
  private async _enqueueIncident(payload: any, req: Request) {
    this.logger.log(`→ enqueueIncident | caller=${payload?.caller_id}`);
    const body = this.buildIncidentBody(payload);
    try {
      const data = await this.resilience.fireWrite(() =>
        firstValueFrom(
          this.httpService.post('/snow-requests/incidents', body, {
            headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
            timeout: this.resilience.writeTimeout,
          }),
        ).then((r) => r.data),
      );
      const correlationId = data?.correlationId;
      if (!correlationId)
        throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
      const prefixed = this.prefixCorrelationId(correlationId);
      this.logger.log(`← enqueueIncident | correlationId=${prefixed}`);
      return { ...data, correlationId: prefixed };
    } catch (err: any) {
      throw this.toHttpError('enqueueIncident', err);
    }
  }

  @Post('requests/enqueue')
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueueRequest(@Body() payload: any, @Req() req: Request) {
    return this.tracing.run(
      'gateway.outbound.sn.enqueueRequest',
      { kind: 'internal' },
      () => this._enqueueRequest(payload, req),
    );
  }
  private async _enqueueRequest(payload: any, req: Request) {
    this.logger.log(`→ enqueueRequest | caller=${payload?.caller_id}`);
    const body = this.buildRequestBody(payload);
    try {
      const data = await this.resilience.fireWrite(() =>
        firstValueFrom(
          this.httpService.post('/snow-requests/service-catalog', body, {
            headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
            timeout: this.resilience.writeTimeout,
          }),
        ).then((r) => r.data),
      );
      const correlationId = data?.correlationId;
      if (!correlationId)
        throw new Error(`Unexpected async response: ${JSON.stringify(data)}`);
      const prefixed = this.prefixCorrelationId(correlationId);
      this.logger.log(`← enqueueRequest | correlationId=${prefixed}`);
      return { ...data, correlationId: prefixed };
    } catch (err: any) {
      throw this.toHttpError('enqueueRequest', err);
    }
  }

  @Get('companies')
  async getCompanies(@Req() req: Request) {
    return this.tracing.run(
      'gateway.outbound.sn.getCompanies',
      { kind: 'internal' },
      () => this._getCompanies(req),
    );
  }
  private async _getCompanies(req: Request) {
    this.logger.log('→ getCompanies');
    try {
      return await this.resilience.fireRead(() =>
        firstValueFrom(
          this.httpService.get('/snow-requests/immediate/companies', {
            headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
            timeout: this.resilience.readTimeout,
          }),
        ).then((r) => r.data),
      );
    } catch (err: any) {
      throw this.toHttpError('getCompanies', err);
    }
  }

  @Get('reconcile/:correlationId')
  async getReconcileStatus(
    @Param('correlationId') correlationId: string,
    @Req() req: Request,
  ) {
    const rawId = this.stripCorrelationPrefix(correlationId);
    this.logger.debug(
      `→ getReconcileStatus | correlationId=${correlationId} → rawId=${rawId}`,
    );
    try {
      return await this.resilience.fireRead(() =>
        firstValueFrom(
          this.httpService.get(`/snow-requests/${rawId}`, {
            headers: { ...this.baseHeaders, ...this.forwardCorrelationId(req) },
            timeout: this.resilience.readTimeout,
          }),
        ).then((r) => r.data),
      );
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw this.toHttpError('getReconcileStatus', err);
    }
  }

  @Post('reconcile/:correlationId/retry')
  @HttpCode(HttpStatus.OK)
  async retrySnowqEntry(
    @Param('correlationId') correlationId: string,
    @Req() req: Request,
  ) {
    return this.tracing.run(
      'gateway.outbound.sn.retrySnowqEntry',
      { kind: 'internal', attributes: { 'sn.correlationId': correlationId } },
      () => this._retrySnowqEntry(correlationId, req),
    );
  }
  private async _retrySnowqEntry(correlationId: string, req: Request) {
    const rawId = this.stripCorrelationPrefix(correlationId);
    this.logger.log(
      `→ retrySnowqEntry | correlationId=${correlationId} → rawId=${rawId}`,
    );
    try {
      return await this.resilience.fireWrite(() =>
        firstValueFrom(
          this.httpService.post(
            `/snow-requests/failed/${rawId}/retry`,
            {},
            {
              headers: {
                ...this.baseHeaders,
                ...this.forwardCorrelationId(req),
              },
              timeout: this.resilience.writeTimeout,
            },
          ),
        ).then((r) => r.data),
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
    return this.tracing.run(
      'gateway.outbound.sn.updateTicket',
      {
        kind: 'internal',
        attributes: { 'sn.table': table, 'sn.sysId': sysId },
      },
      () => this._updateTicket(table, sysId, fields, req),
    );
  }
  private async _updateTicket(
    table: string,
    sysId: string,
    fields: Record<string, any>,
    req: Request,
  ) {
    this.logger.log(`→ updateTicket | table=${table} sysId=${sysId}`);
    try {
      const data = await this.resilience.fireWrite(() =>
        firstValueFrom(
          this.httpService.patch(
            `/snow-requests/immediate/${table}/${sysId}`,
            fields,
            {
              headers: {
                ...this.baseHeaders,
                ...this.forwardCorrelationId(req),
              },
              timeout: this.resilience.writeTimeout,
            },
          ),
        ).then((r) => r.data),
      );
      this.logger.log(`← updateTicket OK`);
      return data;
    } catch (err: any) {
      throw this.toHttpError('updateTicket', err);
    }
  }

  @Post(':table/:sysId/close')
  @HttpCode(HttpStatus.OK)
  async closeTicket(
    @Param('table') table: string,
    @Param('sysId') sysId: string,
    @Body() body: { closeCategory: string; closeNotes?: string },
    @Req() req: Request,
  ) {
    return this.tracing.run(
      'gateway.outbound.sn.closeTicket',
      { kind: 'internal', attributes: { 'sn.table': table, 'sn.sysId': sysId } },
      () => this._closeTicket(table, sysId, body, req),
    );
  }
  private async _closeTicket(
    table: string,
    sysId: string,
    body: { closeCategory: string; closeNotes?: string },
    req: Request,
  ) {
    this.logger.log(`→ closeTicket | table=${table} sysId=${sysId}`);
    try {
      const data = await this.resilience.fireWrite(() =>
        firstValueFrom(
          this.httpService.patch(
            `/snow-requests/immediate/${table}/${sysId}/close`,
            {
              close_code: body.closeCategory,
              close_notes: body.closeNotes ?? 'Cerrado desde Event Corner',
            },
            {
              headers: {
                ...this.baseHeaders,
                ...this.forwardCorrelationId(req),
              },
              timeout: this.resilience.writeTimeout,
            },
          ),
        ).then((r) => r.data),
      );
      this.logger.log(`← closeTicket OK`);
      return data;
    } catch (err: any) {
      throw this.toHttpError('closeTicket', err);
    }
  }

  private toHttpError(method: string, err: any): BadGatewayException {
    const msg: string =
      err?.response?.data?.message ??
      err?.response?.data?.error ??
      err?.message ??
      String(err);
    this.logger.error(`${method} → api-snowq-service failed: ${msg}`);
    return new BadGatewayException(msg);
  }
}
