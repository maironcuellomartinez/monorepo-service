import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Device } from './device.entity';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/create-device.dto';

function seedDevice(partial: Omit<Device, 'deviceId' | 'createdAt' | 'updatedAt' | 'descripcion' | 'usuarioId' | 'usuarioNombre'> & Partial<Pick<Device, 'descripcion' | 'usuarioId' | 'usuarioNombre'>>): Device {
  const now = new Date();
  return {
    deviceId: randomUUID(),
    descripcion: null,
    usuarioId: null,
    usuarioNombre: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/**
 * Store en memoria — reemplaza al Repository<Device> de TypeORM. Se pierde
 * al reiniciar el proceso, lo cual es aceptable: minerva-app es un mock del
 * sistema externo real, no necesita persistencia propia.
 *
 * Sembrado con dispositivos ilustrativos para que el mock devuelva datos
 * útiles sin necesitar seedear manualmente vía SOAP/REST primero. Los
 * `usuarioId` acá son placeholders — no corresponden a UUIDs reales del
 * micorner; usar createDevice/assignDevice para vincular a un usuario real.
 */
const seedDevices: Device[] = [
  seedDevice({
    nombre: 'Laptop Corporativa',
    serialNumber: 'SN-LAPTOP-0001',
    descripcion: 'Dell Latitude asignada a soporte',
    tipo: 'Laptop',
    marca: 'Dell',
    modelo: 'Latitude 5520',
    usuarioId: 'usuario-demo-1',
    usuarioNombre: 'Usuario Demo 1',
  }),
  seedDevice({
    nombre: 'Monitor Externo',
    serialNumber: 'SN-MONITOR-0001',
    descripcion: 'Monitor 27" para puesto fijo',
    tipo: 'Monitor',
    marca: 'LG',
    modelo: '27UL650',
    usuarioId: 'usuario-demo-1',
    usuarioNombre: 'Usuario Demo 1',
  }),
  seedDevice({
    nombre: 'Laptop Corporativa',
    serialNumber: 'SN-LAPTOP-0002',
    descripcion: 'HP EliteBook asignada a ventas',
    tipo: 'Laptop',
    marca: 'HP',
    modelo: 'EliteBook 840',
    usuarioId: 'usuario-demo-2',
    usuarioNombre: 'Usuario Demo 2',
  }),
  seedDevice({
    nombre: 'Docking Station',
    serialNumber: 'SN-DOCK-0001',
    descripcion: 'Sin asignar — disponible en stock',
    tipo: 'Docking Station',
    marca: 'Dell',
    modelo: 'WD19S',
  }),
];

@Injectable()
export class DevicesRepository {
  private readonly devices: Device[] = seedDevices;

  async create(dto: CreateDeviceDto): Promise<Device> {
    const device = seedDevice({
      nombre: dto.nombre,
      serialNumber: dto.serialNumber,
      descripcion: dto.descripcion ?? null,
      tipo: dto.tipo,
      marca: dto.marca,
      modelo: dto.modelo,
      usuarioId: dto.usuarioId ?? null,
      usuarioNombre: dto.usuarioNombre ?? null,
    });
    this.devices.push(device);
    return device;
  }

  async findById(deviceId: string): Promise<Device | null> {
    return this.devices.find((d) => d.deviceId === deviceId) ?? null;
  }

  async findBySerialNumber(serialNumber: string): Promise<Device | null> {
    return this.devices.find((d) => d.serialNumber === serialNumber) ?? null;
  }

  async findByUsuarioId(usuarioId: string): Promise<Device[]> {
    return this.devices
      .filter((d) => d.usuarioId === usuarioId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findAll(): Promise<Device[]> {
    return [...this.devices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Mismo comportamiento que `Repository.update()` de TypeORM: una propiedad
   * en `undefined` significa "no tocar", no "vaciar" — para limpiar un campo
   * hay que mandar `null` explícito. Preserva el comportamiento previo tal
   * cual (incl. el de releaseDevice, que ya mandaba `undefined`).
   */
  async update(deviceId: string, dto: UpdateDeviceDto): Promise<Device | null> {
    const device = this.devices.find((d) => d.deviceId === deviceId);
    if (!device) return null;

    for (const key of Object.keys(dto) as (keyof UpdateDeviceDto)[]) {
      const value = dto[key];
      if (value !== undefined) {
        (device as any)[key] = value;
      }
    }
    device.updatedAt = new Date();
    return device;
  }

  async delete(deviceId: string): Promise<boolean> {
    const index = this.devices.findIndex((d) => d.deviceId === deviceId);
    if (index === -1) return false;
    this.devices.splice(index, 1);
    return true;
  }
}
