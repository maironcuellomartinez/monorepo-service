import { Injectable } from '@nestjs/common';
import { DevicesRepository } from './devices.repository';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/create-device.dto';

export interface CreateDeviceArgs {
  nombre: string;
  serialNumber: string;
  descripcion?: string;
  tipo: string;
  marca: string;
  modelo: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

export interface GetDeviceArgs {
  deviceId: string;
}

export interface GetDevicesByUserArgs {
  usuarioId: string;
}

export interface UpdateDeviceArgs {
  deviceId: string;
  nombre?: string;
  descripcion?: string;
  tipo?: string;
  marca?: string;
  modelo?: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

export interface GetDeviceBySerialArgs {
  serialNumber: string;
}

export interface AssignDeviceArgs {
  serialNumber: string;
  usuarioId: string;
  usuarioNombre?: string;
}

export interface ReleaseDeviceArgs {
  serialNumber: string;
}

export interface DeleteDeviceArgs {
  deviceId: string;
}

@Injectable()
export class DevicesSoapService {
  constructor(private readonly repository: DevicesRepository) {}

  async createDevice(args: CreateDeviceArgs): Promise<{
    deviceId: string;
    serialNumber: string;
    status: string;
    message: string;
  }> {
    try {
      // Check for duplicate serial number
      const existing = await this.repository.findBySerialNumber(args.serialNumber);
      if (existing) {
        return {
          deviceId: '',
          serialNumber: args.serialNumber,
          status: 'ERROR',
          message: 'El serial number ya existe',
        };
      }

      const dto: CreateDeviceDto = {
        nombre: args.nombre,
        serialNumber: args.serialNumber,
        descripcion: args.descripcion,
        tipo: args.tipo,
        marca: args.marca,
        modelo: args.modelo,
        usuarioId: args.usuarioId,
        usuarioNombre: args.usuarioNombre,
      };

      const device = await this.repository.create(dto);

      return {
        deviceId: device.deviceId,
        serialNumber: device.serialNumber,
        status: 'SUCCESS',
        message: 'Dispositivo creado exitosamente',
      };
    } catch (error) {
      return {
        deviceId: '',
        serialNumber: args.serialNumber,
        status: 'ERROR',
        message: `Error al crear dispositivo: ${error.message}`,
      };
    }
  }

  async getDevice(args: GetDeviceArgs): Promise<{
    device?: {
      deviceId: string;
      nombre: string;
      serialNumber: string;
      descripcion: string | null;
      tipo: string;
      marca: string;
      modelo: string;
      usuarioId: string | null;
      usuarioNombre: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    status: string;
    message: string;
  }> {
    try {
      const device = await this.repository.findById(args.deviceId);

      if (!device) {
        return {
          status: 'ERROR',
          message: 'Dispositivo no encontrado',
        };
      }

      return {
        device: {
          deviceId: device.deviceId,
          nombre: device.nombre,
          serialNumber: device.serialNumber,
          descripcion: device.descripcion,
          tipo: device.tipo,
          marca: device.marca,
          modelo: device.modelo,
          usuarioId: device.usuarioId,
          usuarioNombre: device.usuarioNombre,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt,
        },
        status: 'SUCCESS',
        message: 'Dispositivo encontrado',
      };
    } catch (error) {
      return {
        status: 'ERROR',
        message: `Error al consultar dispositivo: ${error.message}`,
      };
    }
  }

  async getDevicesByUser(args: GetDevicesByUserArgs): Promise<{
    devices?: { device: object[] };
    status: string;
    message: string;
  }> {
    try {
      const devices = await this.repository.findByUsuarioId(args.usuarioId);

      return {
        devices: {
          device: devices.map((d) => ({
            deviceId: d.deviceId,
            nombre: d.nombre,
            serialNumber: d.serialNumber,
            descripcion: d.descripcion,
            tipo: d.tipo,
            marca: d.marca,
            modelo: d.modelo,
            usuarioId: d.usuarioId,
            usuarioNombre: d.usuarioNombre,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          })),
        },
        status: 'SUCCESS',
        message: `Se encontraron ${devices.length} dispositivos`,
      };
    } catch (error) {
      return {
        status: 'ERROR',
        message: `Error al consultar dispositivos: ${error.message}`,
      };
    }
  }

  async getAllDevices(): Promise<{
    devices?: { device: object[] };
    status: string;
    message: string;
  }> {
    try {
      const devices = await this.repository.findAll();

      return {
        devices: {
          device: devices.map((d) => ({
            deviceId: d.deviceId,
            nombre: d.nombre,
            serialNumber: d.serialNumber,
            descripcion: d.descripcion,
            tipo: d.tipo,
            marca: d.marca,
            modelo: d.modelo,
            usuarioId: d.usuarioId,
            usuarioNombre: d.usuarioNombre,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          })),
        },
        status: 'SUCCESS',
        message: `Se encontraron ${devices.length} dispositivos`,
      };
    } catch (error) {
      return {
        status: 'ERROR',
        message: `Error al consultar dispositivos: ${error.message}`,
      };
    }
  }

  async updateDevice(args: UpdateDeviceArgs): Promise<{
    deviceId: string;
    status: string;
    message: string;
  }> {
    try {
      const existing = await this.repository.findById(args.deviceId);

      if (!existing) {
        return {
          deviceId: args.deviceId,
          status: 'ERROR',
          message: 'Dispositivo no encontrado',
        };
      }

      const dto: UpdateDeviceDto = {};
      if (args.nombre !== undefined) dto.nombre = args.nombre;
      if (args.descripcion !== undefined) dto.descripcion = args.descripcion;
      if (args.tipo !== undefined) dto.tipo = args.tipo;
      if (args.marca !== undefined) dto.marca = args.marca;
      if (args.modelo !== undefined) dto.modelo = args.modelo;
      if (args.usuarioId !== undefined) dto.usuarioId = args.usuarioId;
      if (args.usuarioNombre !== undefined) dto.usuarioNombre = args.usuarioNombre;

      const updated = await this.repository.update(args.deviceId, dto);

      if (!updated) {
        return {
          deviceId: args.deviceId,
          status: 'ERROR',
          message: 'Dispositivo no encontrado después de actualizar',
        };
      }

      return {
        deviceId: updated.deviceId,
        status: 'SUCCESS',
        message: 'Dispositivo actualizado exitosamente',
      };
    } catch (error) {
      return {
        deviceId: args.deviceId,
        status: 'ERROR',
        message: `Error al actualizar dispositivo: ${error.message}`,
      };
    }
  }

  async getDeviceBySerial(args: GetDeviceBySerialArgs): Promise<{
    device?: {
      deviceId: string;
      nombre: string;
      serialNumber: string;
      descripcion: string | null;
      tipo: string;
      marca: string;
      modelo: string;
      usuarioId: string | null;
      usuarioNombre: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    status: string;
    message: string;
  }> {
    try {
      const device = await this.repository.findBySerialNumber(args.serialNumber);
      if (!device) {
        return { status: 'ERROR', message: 'Dispositivo no encontrado' };
      }
      return {
        device: {
          deviceId: device.deviceId,
          nombre: device.nombre,
          serialNumber: device.serialNumber,
          descripcion: device.descripcion,
          tipo: device.tipo,
          marca: device.marca,
          modelo: device.modelo,
          usuarioId: device.usuarioId,
          usuarioNombre: device.usuarioNombre,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt,
        },
        status: 'SUCCESS',
        message: 'Dispositivo encontrado',
      };
    } catch (error) {
      return { status: 'ERROR', message: `Error al consultar dispositivo: ${error.message}` };
    }
  }

  async assignDevice(args: AssignDeviceArgs): Promise<{
    serialNumber: string;
    status: string;
    message: string;
  }> {
    try {
      const device = await this.repository.findBySerialNumber(args.serialNumber);
      if (!device) {
        return { serialNumber: args.serialNumber, status: 'ERROR', message: 'Dispositivo no encontrado' };
      }
      await this.repository.update(device.deviceId, {
        usuarioId: args.usuarioId,
        usuarioNombre: args.usuarioNombre,
      });
      return { serialNumber: args.serialNumber, status: 'SUCCESS', message: 'Dispositivo asignado exitosamente' };
    } catch (error) {
      return { serialNumber: args.serialNumber, status: 'ERROR', message: `Error al asignar dispositivo: ${error.message}` };
    }
  }

  async releaseDevice(args: ReleaseDeviceArgs): Promise<{
    serialNumber: string;
    status: string;
    message: string;
  }> {
    try {
      const device = await this.repository.findBySerialNumber(args.serialNumber);
      if (!device) {
        return { serialNumber: args.serialNumber, status: 'ERROR', message: 'Dispositivo no encontrado' };
      }
      await this.repository.update(device.deviceId, { usuarioId: undefined, usuarioNombre: undefined });
      return { serialNumber: args.serialNumber, status: 'SUCCESS', message: 'Dispositivo liberado exitosamente' };
    } catch (error) {
      return { serialNumber: args.serialNumber, status: 'ERROR', message: `Error al liberar dispositivo: ${error.message}` };
    }
  }

  async deleteDevice(args: DeleteDeviceArgs): Promise<{
    status: string;
    message: string;
  }> {
    try {
      const existing = await this.repository.findById(args.deviceId);

      if (!existing) {
        return {
          status: 'ERROR',
          message: 'Dispositivo no encontrado',
        };
      }

      await this.repository.delete(args.deviceId);

      return {
        status: 'SUCCESS',
        message: 'Dispositivo eliminado exitosamente',
      };
    } catch (error) {
      return {
        status: 'ERROR',
        message: `Error al eliminar dispositivo: ${error.message}`,
      };
    }
  }
}
