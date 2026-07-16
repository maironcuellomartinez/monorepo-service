import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  RequestType,
  RequestTypeUtils,
  ResponseServiceNowSuccess,
  TracingClient,
} from '../../common';
import { firstValueFrom } from 'rxjs';
import { ServiceNowErrorFactory } from './servicenow-error.factory';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parsea el header Retry-After (RFC 7231) a milisegundos.
 * Acepta tanto delta-seconds ("30") como HTTP-date ("Wed, 21 Oct 2025 07:28:00 GMT").
 */
function parseRetryAfterMs(header?: string): number | undefined {
  if (!header) return undefined;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1_000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return undefined;
}

/** Estados de SN que se consideran "cerrado"
 *  6 = Resolved (incident), 7 = Closed (incident)
 *  3 = Closed (change_request / sc_req_item / sc_task)
 *  0 = Review/Resolved (change_request)
 *  4 = Closed/Resolved (problem / sc_req_item / sc_task)
 */
const SN_CLOSED_STATES = new Set([
  'resolved',
  'closed',
  '0',
  '3',
  '4',
  '6',
  '7',
]);

@Injectable()
export class ServiceNowClientService {
  private readonly logger = new Logger(ServiceNowClientService.name);
  private readonly tracing = TracingClient.getInstance();

  constructor(
    private readonly httpService: HttpService,
    private readonly errorFactory: ServiceNowErrorFactory,
  ) {}

  /**
   * Post to ServiceNow.
   * @example
   * const response = await serviceNowClient.postToServiceNow(RequestType.INCIDENT, payload);
   * @param type RequestType
   * @param payload Record<string, any>
   * @returns Promise<ResponseServiceNowSuccess>
   * @description Envía una solicitud a ServiceNow. Retorna sys_id y number del registro creado.
   */
  async postToServiceNow(
    type: RequestType,
    payload: Record<string, any>,
  ): Promise<ResponseServiceNowSuccess> {
    return this.tracing.run(
      'servicenow.post',
      {
        kind: 'client',
        attributes: {
          'snow.type': type,
          'snow.baseUrl': process.env.BASE_URL_SERVICENOW ?? '',
        },
      },
      async () => {
        const baseUrl = process.env.BASE_URL_SERVICENOW ?? '';
        const endpoint = `${baseUrl}${RequestTypeUtils.getEndpoint(type)}`;
        const correlationId = uuidv4();

        this.logger.debug(
          `[${type}] Enviando solicitud con correlationId: ${correlationId}`,
        );

        const response = await firstValueFrom(
          this.httpService.post(endpoint, payload, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${process.env.SN_AUTH}`,
              'X-Correlation-ID': correlationId,
            },
            timeout: 10000,
          }),
        ).catch((error: any) => {
          this.logger.error(`[${type}] Error en ServiceNow: ${error.message}`);
          const statusCode = error.response?.status || 500;
          const retryAfterMs =
            statusCode === 429
              ? parseRetryAfterMs(error.response?.headers?.['retry-after'])
              : undefined;
          throw this.errorFactory.create(
            statusCode,
            `error in [${type}] Error en ServiceNow: ${error.message}`,
            error.message,
            retryAfterMs,
          );
        });

        const result: ResponseServiceNowSuccess = response.data;
        this.logger.log(
          `[${type}] Respuesta recibida → sys_id: ${result.result.sys_id} | number: ${result.result.number}`,
        );
        return result;
      },
    );
  }

  /**
   * PATCH a un registro existente en ServiceNow.
   * Usado para cerrar/resolver tickets (ej: recovery de Nagios).
   */
  async patchToServiceNow(
    type: RequestType,
    sysId: string,
    body: Record<string, any>,
  ): Promise<void> {
    return TracingClient.getInstance().run(
      'snowq.client.servicenow.patchToServiceNow',
      { kind: 'client', attributes: { 'sn.sysId': sysId } },
      () => this._patchToServiceNow(type, sysId, body),
    );
  }

  private async _patchToServiceNow(
    type: RequestType,
    sysId: string,
    body: Record<string, any>,
  ): Promise<void> {
    const baseUrl = process.env.BASE_URL_SERVICENOW ?? '';
    const endpoint = `${baseUrl}${RequestTypeUtils.getEndpoint(type)}/${sysId}`;

    this.logger.debug(`[${type}] PATCH ${endpoint}`);

    try {
      await firstValueFrom(
        this.httpService.patch(endpoint, body, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${process.env.SN_AUTH}`,
          },
          timeout: 10000,
        }),
      );
      this.logger.log(
        `[${type}] PATCH OK → sys_id=${sysId} campos=${Object.keys(body).join(',')}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[${type}] Error en PATCH ServiceNow: ${error.message}`,
      );
      throw this.errorFactory.create(
        error.response?.status || 500,
        `error in [${type}] PATCH ServiceNow: ${error.message}`,
        error.message,
      );
    }
  }

  /**
   * Lista el catálogo de empresas de ServiceNow (usado por SnCompanySyncJob del monolito).
   */
  async getCompanies(): Promise<Array<{ sys_id: string; name: string }>> {
    return TracingClient.getInstance().run(
      'snowq.client.servicenow.getCompanies',
      { kind: 'client' },
      () => this._getCompanies(),
    );
  }

  private async _getCompanies(): Promise<
    Array<{ sys_id: string; name: string }>
  > {
    const baseUrl = process.env.BASE_URL_SERVICENOW ?? '';
    const endpoint = `${baseUrl}/sn-companies`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: { Authorization: `Basic ${process.env.SN_AUTH}` },
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `getCompanies: Error consultando ServiceNow: ${error.message}`,
      );
      throw this.errorFactory.create(
        error.response?.status || 500,
        `error getting companies from ServiceNow: ${error.message}`,
        error.message,
      );
    }
  }

  /**
   * Lista el catálogo de grupos de asignación de ServiceNow (usado por api-gateway
   * para el picker de corners/CompanyIssueConfig).
   */
  async getGroups(): Promise<Array<{ sys_id: string; name: string }>> {
    return TracingClient.getInstance().run(
      'snowq.client.servicenow.getGroups',
      { kind: 'client' },
      () => this._getGroups(),
    );
  }

  private async _getGroups(): Promise<Array<{ sys_id: string; name: string }>> {
    const baseUrl = process.env.BASE_URL_SERVICENOW ?? '';
    const endpoint = `${baseUrl}/sn-groups`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: { Authorization: `Basic ${process.env.SN_AUTH}` },
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `getGroups: Error consultando ServiceNow: ${error.message}`,
      );
      throw this.errorFactory.create(
        error.response?.status || 500,
        `error getting groups from ServiceNow: ${error.message}`,
        error.message,
      );
    }
  }

  /**
   * Consulta un grupo de asignación por sys_id. Retorna null si no existe (404).
   */
  async getGroupBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string } | null> {
    return TracingClient.getInstance().run(
      'snowq.client.servicenow.getGroupBySysId',
      { kind: 'client', attributes: { 'sn.sysId': sysId } },
      () => this._getGroupBySysId(sysId),
    );
  }

  private async _getGroupBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string } | null> {
    const baseUrl = process.env.BASE_URL_SERVICENOW ?? '';
    const endpoint = `${baseUrl}/sn-groups/${sysId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: { Authorization: `Basic ${process.env.SN_AUTH}` },
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      this.logger.error(
        `getGroupBySysId: Error consultando ServiceNow: ${error.message}`,
      );
      throw this.errorFactory.create(
        error.response?.status || 500,
        `error getting group from ServiceNow: ${error.message}`,
        error.message,
      );
    }
  }

  /**
   * Consulta una empresa por sys_id. Retorna null si no existe (404).
   */
  async getCompanyBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string } | null> {
    return TracingClient.getInstance().run(
      'snowq.client.servicenow.getCompanyBySysId',
      { kind: 'client', attributes: { 'sn.sysId': sysId } },
      () => this._getCompanyBySysId(sysId),
    );
  }

  private async _getCompanyBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string } | null> {
    const baseUrl = process.env.BASE_URL_SERVICENOW ?? '';
    const endpoint = `${baseUrl}/sn-companies/${sysId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: { Authorization: `Basic ${process.env.SN_AUTH}` },
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      this.logger.error(
        `getCompanyBySysId: Error consultando ServiceNow: ${error.message}`,
      );
      throw this.errorFactory.create(
        error.response?.status || 500,
        `error getting company from ServiceNow: ${error.message}`,
        error.message,
      );
    }
  }

  /**
   * Consulta el estado actual de un ticket en ServiceNow.
   * Retorna null si el ticket no existe (404).
   */
  async getTicketState(
    type: RequestType,
    sysId: string,
  ): Promise<{ state: string; closed: boolean } | null> {
    const baseUrl = process.env.BASE_URL_SERVICENOW ?? '';
    const endpoint = `${baseUrl}${RequestTypeUtils.getEndpoint(type)}/${sysId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: { Authorization: `Basic ${process.env.SN_AUTH}` },
          timeout: 10000,
        }),
      );
      const state: string = String(response.data?.result?.state ?? 'unknown');
      return { state, closed: SN_CLOSED_STATES.has(state.toLowerCase()) };
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw this.errorFactory.create(
        error.response?.status || 500,
        `error in [${type}] GET ServiceNow: ${error.message}`,
        error.message,
      );
    }
  }
}
