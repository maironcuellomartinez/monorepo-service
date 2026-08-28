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

  /**
   * Ejecuta una operación SOAP y, si falla por un problema de transporte,
   * descarta el cliente cacheado y reintenta una vez con uno nuevo.
   *
   * Sin esto, el cliente que se crea en onModuleInit queda cacheado de por
   * vida: cuando minerva-app se reinicia —y al correr bajo `--watch` eso pasa
   * en cada guardado— el socket subyacente muere y TODAS las llamadas de
   * inventario fallan indefinidamente, hasta que se reinicia también este
   * servicio. El síntoma aguas arriba es un 500 aquí, que el api-gateway
   * traduce a 502 y deja los dispositivos del micorner en SYNC_ERROR.
   *
   * Solo se reintentan los errores de transporte: un fault SOAP legítimo
   * (dispositivo inexistente) no mejora por recrear el cliente.
   */
  private async invoke<T>(operation: (client: soap.Client) => Promise<T>): Promise<T> {
    try {
      return await operation(await this.getClient());
    } catch (err: any) {
      if (!this.isTransportError(err)) throw err;
      this.logger.warn(`Minerva SOAP: transporte caído (${err?.code ?? err?.message}) — recreando cliente y reintentando`);
      this.client = null;
      return operation(await this.getClient());
    }
  }

  private isTransportError(err: any): boolean {
    const code = err?.code ?? err?.cause?.code;
    if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) {
      return true;
    }
    // node-soap envuelve fallos de red en Error sin `code` cuando el WSDL ya
    // estaba cargado, así que se mira también el mensaje.
    return /socket hang up|ECONNREFUSED|ECONNRESET|connect|network/i.test(err?.message ?? '');
  }

  async getDeviceBySerial(serialNumber: string): Promise<SoapDeviceResponse> {
    return this.invoke(async (client) => {
      const [result] = await client.getDeviceBySerialAsync({ serialNumber });
      return result;
    });
  }

  async getDevicesByUser(usuarioId: string): Promise<{ devices?: SoapDevice[]; status: string; message: string }> {
    return this.invoke(async (client) => {
      const [result] = await client.getDevicesByUserAsync({ usuarioId });
      return { ...result, devices: this.parseDeviceArray(result?.devices) };
    });
  }

  async getAllDevices(): Promise<{ devices: SoapDevice[]; status: string; message: string }> {
    return this.invoke(async (client) => {
      const [result] = await client.getAllDevicesAsync({});
      return { ...result, devices: this.parseDeviceArray(result?.devices) };
    });
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
