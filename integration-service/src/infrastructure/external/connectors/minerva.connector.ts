import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MinervaSoapClient, SoapDevice } from './minerva-soap.client';
import { TracingService } from '../../monitoring/tracing.service';
import { describeError } from '../../../shared/utils/error.util';

export interface MinervaDevice {
  serialNumber: string;
  deviceType: string;
  model: string | null;
  brand: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
}

export interface MinervaAssignmentRequest {
  serialNumber: string;
  appointmentId: string;
  userId: string;
  userName?: string;
  cornerId: string;
  expectedReturnDate?: string;
}

export interface MinervaAssignmentResponse {
  serialNumber: string;
  assignedAt: string;
  status: 'ASSIGNED';
}

@Injectable()
export class MinervaConnector {
  private readonly logger = new Logger(MinervaConnector.name);

  constructor(
    private readonly soapClient: MinervaSoapClient,
    private readonly configService: ConfigService,
    private readonly tracing: TracingService,
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

  async checkDeviceAvailability(serialNumber: string): Promise<boolean> {
    const device = await this.getDeviceBySerial(serialNumber);
    return device !== null && device.assignedTo === null;
  }

  async listAvailableDevices(deviceType: string): Promise<MinervaDevice[]> {
    try {
      const response = await this.soapClient.getAllDevices();
      return response.devices
        .filter((d) => d.tipo === deviceType && !d.usuarioId)
        .map((d) => this.mapDevice(d));
    } catch (error) {
      this.logger.error(
        `listAvailableDevices(${deviceType}): ${describeError(error)}`,
      );
      throw error;
    }
  }

  async assignDevice(
    request: MinervaAssignmentRequest,
  ): Promise<MinervaAssignmentResponse> {
    return this.tracing.run(
      'integration.connector.minerva.assignDevice',
      { kind: 'client', attributes: { 'device.serial': request.serialNumber } },
      () => this._assignDevice(request),
    );
  }

  private async _assignDevice(
    request: MinervaAssignmentRequest,
  ): Promise<MinervaAssignmentResponse> {
    try {
      const response = await this.soapClient.assignDevice(
        request.serialNumber,
        request.userId,
        request.userName,
      );
      if (response.status === 'ERROR') {
        throw new Error(response.message);
      }
      this.logger.log(
        `Device ${request.serialNumber} assigned to user ${request.userId}`,
      );
      return {
        serialNumber: request.serialNumber,
        assignedAt: new Date().toISOString(),
        status: 'ASSIGNED',
      };
    } catch (error) {
      this.logger.error(
        `assignDevice(${request.serialNumber}): ${describeError(error)}`,
      );
      throw error;
    }
  }

  async releaseDevice(serialNumber: string): Promise<void> {
    return this.tracing.run(
      'integration.connector.minerva.releaseDevice',
      { kind: 'client', attributes: { 'device.serial': serialNumber } },
      () => this._releaseDevice(serialNumber),
    );
  }

  private async _releaseDevice(serialNumber: string): Promise<void> {
    try {
      const response = await this.soapClient.releaseDevice(serialNumber);
      if (response.status === 'ERROR') {
        throw new Error(response.message);
      }
      this.logger.log(`Device ${serialNumber} released`);
    } catch (error) {
      this.logger.error(
        `releaseDevice(${serialNumber}): ${describeError(error)}`,
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
