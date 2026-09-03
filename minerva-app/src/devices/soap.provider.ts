import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Request, Response } from 'express';
import * as soap from 'soap';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { DevicesSoapService } from './devices.soap.service';

@Injectable()
export class SoapProvider implements OnModuleInit, OnModuleDestroy {
  private soapServer: any;
  private httpServer: http.Server;
  private wsdlPath: string;
  private readonly port: number;

  constructor(private readonly devicesService: DevicesSoapService) {
    this.wsdlPath = path.resolve(__dirname, 'devices.wsdl');
    this.port = parseInt(process.env.SOAP_PORT || '3016', 10);
  }

  async onModuleInit() {
    // Leer el WSDL
    const wsdlXml = fs.readFileSync(this.wsdlPath, 'utf-8');

    // Servidor HTTP con el fallback para requests que no matchean el path
    // SOAP (/devices) — soap.listen() de mas abajo remueve este listener del
    // httpServer y lo re-engancha por su cuenta, delegandole las requests
    // que no son SOAP; no hay que (ni se puede, no existe en esta version)
    // invocar handleHTTP manualmente sobre el objeto que devuelve.
    this.httpServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Minerva SOAP Service - WSDL available at /devices?wsdl');
    });

    // Definir servicios
    const services = {
      DeviceInventoryService: {
        DeviceInventoryPort: {
          createDevice: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.createDevice(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          getDeviceBySerial: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.getDeviceBySerial(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          getDevice: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.getDevice(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          getDevicesByUser: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.getDevicesByUser(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          getAllDevices: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.getAllDevices();
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          updateDevice: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.updateDevice(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          assignDevice: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.assignDevice(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          releaseDevice: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.releaseDevice(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
          deleteDevice: async (args: any, next: any) => {
            try {
              const result = await this.devicesService.deleteDevice(args);
              next(null, result);
            } catch (error) {
              next(error);
            }
          },
        },
      },
    };

    // Crear servidor SOAP
    this.soapServer = await soap.listen(this.httpServer, {
      path: '/devices',
      services: services,
      xml: wsdlXml,
    });

    // Iniciar servidor HTTP
    await new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`SOAP server running on port ${this.port}`);
        console.log(`WSDL available at http://localhost:${this.port}/devices?wsdl`);
        resolve();
      });
    });
  }

  onModuleDestroy(): void {
    if (this.httpServer?.listening) {
      this.httpServer.close();
    }
  }

  getWsdl(): string {
    return fs.readFileSync(this.wsdlPath, 'utf-8');
  }
}
