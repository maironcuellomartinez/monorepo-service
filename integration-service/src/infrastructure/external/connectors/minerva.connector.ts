import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MinervaSoapClient, SoapDevice } from './minerva-soap.client';
import { describeError } from '../../../shared/utils/error.util';

export interface MinervaDevice {
  serialNumber: string;
  deviceType: string;
  model: string | null;
  brand: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
}

@Injectable()
export class MinervaConnector {
  private readonly logger = new Logger(MinervaConnector.name);

  constructor(
    private readonly soapClient: MinervaSoapClient,
    private readonly configService: ConfigService,
  ) {}

  private mapDevice(raw: SoapDevice): MinervaDevice {
    return {
      serialNumber: raw.serialNumber,
      deviceType: raw.tipo,
      model: raw.modelo || null,
      brand: raw.marca || null,
      assignedTo: raw.usuarioId || null,
      assignedUserName: raw.usuarioNombre || null,
    };
  }

  async getDeviceBySerial(serialNumber: string): Promise<MinervaDevice | null> {
    try {
      const response = await this.soapClient.getDeviceBySerial(serialNumber);
      if (response.status === 'ERROR' || !response.device) return null;
      return this.mapDevice(response.device);
    } catch (error) {
      this.logger.error(
        `getDeviceBySerial(${serialNumber}): ${describeError(error)}`,
      );
      throw error;
    }
  }

  async getDevicesByUser(usuarioId: string): Promise<MinervaDevice[]> {
    try {
      const response = await this.soapClient.getDevicesByUser(usuarioId);
      return (response.devices ?? []).map((d) => this.mapDevice(d));
    } catch (error) {
      this.logger.error(
        `getDevicesByUser(${usuarioId}): ${describeError(error)}`,
      );
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'HEALTHY' | 'UNHEALTHY';
    latencyMs?: number;
  }> {
    try {
      const start = Date.now();
      await this.soapClient.getDeviceBySerial('__health_check__');
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'UNHEALTHY' };
    }
  }
}
