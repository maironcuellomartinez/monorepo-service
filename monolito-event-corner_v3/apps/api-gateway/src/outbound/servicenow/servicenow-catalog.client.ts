// api-gateway/outbound/servicenow/servicenow-catalog.client.ts
import {
  Injectable,
  Logger,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Cliente hacia api-snowq-service para lecturas de catálogo (grupos y empresas de
 * ServiceNow), usado por los pickers/validaciones de los controllers admin.
 *
 * Comparte el HttpService de ServiceNowOutboundModule (baseURL = SNOWQ_URL) —
 * único egress hacia ServiceNow del ecosistema, ya no se contacta el simulador
 * directo desde estos controllers.
 */
@Injectable()
export class ServiceNowCatalogClient {
  private readonly logger = new Logger(ServiceNowCatalogClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.get<string>('ABAC_M2M_TOKEN', '')}`,
    };
  }

  async getCompanies(): Promise<Array<{ sys_id: string; name: string }>> {
    try {
      const { data } = await firstValueFrom(
        this.http.get('/snow-requests/immediate/companies', {
          headers: this.headers,
          timeout: 3000,
        }),
      );
      return data;
    } catch (err: any) {
      this.logger.error(`getCompanies: ${err?.message}`);
      throw new BadGatewayException(
        'No se pudo obtener el catálogo de empresas de ServiceNow',
      );
    }
  }

  async getGroups(): Promise<Array<{ sys_id: string; name: string }>> {
    try {
      const { data } = await firstValueFrom(
        this.http.get('/snow-requests/immediate/groups', {
          headers: this.headers,
          timeout: 3000,
        }),
      );
      return data;
    } catch (err: any) {
      this.logger.error(`getGroups: ${err?.message}`);
      throw new BadGatewayException(
        'No se pudo obtener el catálogo de grupos de ServiceNow',
      );
    }
  }

  async getGroupBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string }> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`/snow-requests/immediate/groups/${sysId}`, {
          headers: this.headers,
          timeout: 3000,
        }),
      );
      return data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new NotFoundException(
          `El grupo con sys_id "${sysId}" no existe en ServiceNow`,
        );
      }
      this.logger.error(`getGroupBySysId: ${err?.message}`);
      throw new BadGatewayException(
        'No se pudo validar el grupo en ServiceNow',
      );
    }
  }

  async getCompanyBySysId(
    sysId: string,
  ): Promise<{ sys_id: string; name: string }> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`/snow-requests/immediate/companies/${sysId}`, {
          headers: this.headers,
          timeout: 3000,
        }),
      );
      return data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new NotFoundException(
          `La empresa con sys_id "${sysId}" no existe en ServiceNow`,
        );
      }
      this.logger.error(`getCompanyBySysId: ${err?.message}`);
      throw new BadGatewayException(
        'No se pudo contactar a ServiceNow para validar la empresa',
      );
    }
  }
}
