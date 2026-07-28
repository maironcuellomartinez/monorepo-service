import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as soap from 'soap';

export interface SoapDevice {
  deviceId: string;
  nombre: string;
  serialNumber: string;
  descripcion: string | null;
  tipo: string;
  marca: string;
  modelo: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoapDeviceResponse {
  device?: SoapDevice;
  status: 'SUCCESS' | 'ERROR';
  message: string;
}

/**
 * Cliente SOAP para Minerva (sistema de inventario externo).
 * Carga el WSDL en caliente desde la URL del servidor SOAP al iniciar.
 * Todas las operaciones lanzan error si el servidor no responde.
 */
@Injectable()
export class MinervaSoapClient implements OnModuleInit {
  private readonly logger = new Logger(MinervaSoapClient.name);
  private client: soap.Client | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const wsdlUrl = this.config.get<string>('minerva.soapWsdlUrl', 'http://localhost:3016/devices?wsdl');
    try {
      this.client = await soap.createClientAsync(wsdlUrl);
      this.logger.log(`Minerva SOAP client initialized — WSDL: ${wsdlUrl}`);
    } catch (err: any) {
      this.logger.warn(`Minerva SOAP client init failed (will retry on first call): ${err.message}`);
    }
  }

  private async getClient(): Promise<soap.Client> {
    if (this.client) return this.client;
    const wsdlUrl = this.config.get<string>('minerva.soapWsdlUrl', 'http://localhost:3016/devices?wsdl');
    this.client = await soap.createClientAsync(wsdlUrl);
    return this.client;
  }

  async getDeviceBySerial(serialNumber: string): Promise<SoapDeviceResponse> {
    const client = await this.getClient();
    const [result] = await client.getDeviceBySerialAsync({ serialNumber });
    return result;
  }

  async getDevicesByUser(usuarioId: string): Promise<{ devices?: SoapDevice[]; status: string; message: string }> {
    const client = await this.getClient();
    const [result] = await client.getDevicesByUserAsync({ usuarioId });
    return { ...result, devices: this.parseDeviceArray(result?.devices) };
  }

  async getAllDevices(): Promise<{ devices: SoapDevice[]; status: string; message: string }> {
    const client = await this.getClient();
    const [result] = await client.getAllDevicesAsync({});
    return { ...result, devices: this.parseDeviceArray(result?.devices) };
  }

  /** Normaliza los distintos formatos que node-soap puede devolver para DeviceArrayType */
  private parseDeviceArray(raw: any): SoapDevice[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    // Formato correcto según WSDL: { device: SoapDevice | SoapDevice[] }
    if (raw.device) return Array.isArray(raw.device) ? raw.device : [raw.device];
    // Fallback: el objeto ES el dispositivo (serialización incorrecta con 1 item)
    if (raw.serialNumber) return [raw as SoapDevice];
    return [];
  }

}
