import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { SoapProvider } from './soap.provider';

@Controller('devices')
export class DevicesController {
  constructor(private readonly soapProvider: SoapProvider) {}

  @Get()
  getHello(@Res() res: Response): void {
    res
      .set('Content-Type', 'text/plain')
      .send('Minerva Device Inventory SOAP Service\nWSDL available at /devices?wsdl');
  }
}
