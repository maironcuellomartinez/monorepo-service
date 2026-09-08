import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { describeError } from '../shared/utils/error.util';

export interface MinervaDevice {
  serialNumber: string;
  deviceType: string;
  model: string | null;
  brand: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
}

interface MinervaApiDevice {
  serial_number: string;
  model: string | null;
  brand: string | null;
  device_type: string | null;
  assigned_user: { userId: string; nombre: string } | null;
}

/**
 * Cliente HTTP para Minerva (sistema de inventario externo). Reemplaza al
 * antiguo cliente SOAP — minerva-app (mock local) y el Minerva real de
 * staging/prod ya exponen REST (MINERVA_BASE_URL/MINERVA_API_KEY).
 */
@Injectable()
export class MinervaConnector {
  private readonly logger = new Logger(MinervaConnector.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('minerva.baseUrl', 'http://localhost:3015/api');
    this.apiKey = this.configService.get<string>('minerva.apiKey', '');
    this.timeout = this.configService.get<number>('minerva.timeout', 10000);
  }

  private get headers(): Record<string, string> {
    return this.apiKey ? { 'x-api-key': this.apiKey } : {};
  }

  private mapDevice(raw: MinervaApiDevice): MinervaDevice {
    return {
      serialNumber: raw.serial_number,
      deviceType: raw.device_type ?? '',
      model: raw.model ?? null,
      brand: raw.brand ?? null,
      assignedTo: raw.assigned_user?.userId ?? null,
      assignedUserName: raw.assigned_user?.nombre ?? null,
    };
  }

  async getDeviceBySerial(serialNumber: string): Promise<MinervaDevice | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<MinervaApiDevice>(
          `${this.baseUrl}/devices/${encodeURIComponent(serialNumber)}`,
          { headers: this.headers, timeout: this.timeout },
        ),
      );
      return this.mapDevice(data);
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      this.logger.error(`getDeviceBySerial(${serialNumber}): ${describeError(error)}`);
      throw error;
    }
  }

  async getDevicesByUser(usuarioId: string): Promise<MinervaDevice[]> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<MinervaApiDevice[]>(
          `${this.baseUrl}/users/${encodeURIComponent(usuarioId)}`,
          { headers: this.headers, timeout: this.timeout },
        ),
      );
      return (data ?? []).map((d) => this.mapDevice(d));
    } catch (error: any) {
      this.logger.error(`getDevicesByUser(${usuarioId}): ${describeError(error)}`);
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'HEALTHY' | 'UNHEALTHY';
    latencyMs?: number;
  }> {
    try {
      const start = Date.now();
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/health`, {
          headers: this.headers,
          timeout: this.timeout,
        }),
      );
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'UNHEALTHY' };
    }
  }
}
