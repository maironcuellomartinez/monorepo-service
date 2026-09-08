import { Controller, Get, Post, Body, Param, NotFoundException, ConflictException, HttpCode, HttpStatus } from '@nestjs/common';
import { DevicesRepository } from './devices.repository';
import { CreateDeviceDto } from './dto/create-device.dto';

/**
 * REST API layer para integración con el ecosistema Event Corner.
 *
 * Único punto de entrada de minerva-app (el SOAP viejo se eliminó — ver
 * git history de soap.provider.ts/devices.soap.service.ts). Consumido por
 * integration-service (MinervaConnector), que a su vez expone
 * /api/v1/minerva/* hacia el api-gateway.
 *
 * Formato de respuesta (ApiDevice, documentado en inventory-service.port.ts
 * del monolith): { serial_number, model, brand, device_type, assigned_user }
 */
@Controller('api')
export class DevicesRestController {
  constructor(private readonly repository: DevicesRepository) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'minerva-app' };
  }

  /** POST /api/devices  o  POST /api/v1/devices */
  @Post(['devices', 'v1/devices'])
  @HttpCode(HttpStatus.CREATED)
  async createDevice(@Body() dto: CreateDeviceDto) {
    const existing = await this.repository.findBySerialNumber(dto.serialNumber);
    if (existing) {
      throw new ConflictException(`Device with serial ${dto.serialNumber} already exists`);
    }
    const device = await this.repository.create(dto);
    return {
      deviceId: device.deviceId,
      serialNumber: device.serialNumber,
      status: 'SUCCESS',
      message: 'Dispositivo creado exitosamente',
    };
  }

  @Get('devices/:serialNumber')
  async getBySerial(@Param('serialNumber') serialNumber: string) {
    const device = await this.repository.findBySerialNumber(serialNumber);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return {
      serial_number: device.serialNumber,
      model: device.modelo || null,
      brand: device.marca || null,
      device_type: device.tipo || null,
      assigned_user: device.usuarioId
        ? {
            userId: device.usuarioId,
            nombre: device.usuarioNombre || device.usuarioId,
          }
        : null,
    };
  }

  @Get('users/:userId')
  async getByUser(@Param('userId') userId: string) {
    const devices = await this.repository.findByUsuarioId(userId);
    return devices.map((device) => ({
      serial_number: device.serialNumber,
      model: device.modelo || null,
      brand: device.marca || null,
      device_type: device.tipo || null,
      assigned_user: device.usuarioId
        ? {
            userId: device.usuarioId,
            nombre: device.usuarioNombre || device.usuarioId,
          }
        : null,
    }));
  }
}
