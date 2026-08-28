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
 * IMPORTANTE — estos seriales no son ilustrativos: son exactamente los de
 * `event_corner.devices` del micorner, y deben seguir siéndolo. El job de
 * sincronización del micorner pide por serial (`getDeviceBySerial`), así que
 * un serial que no exista acá deja al dispositivo en `SYNC_ERROR` para
 * siempre — no hay onboarding que lo cree, porque el micorner solo lee de
 * este inventario, nunca escribe en él.
 *
 * Los `usuarioId` también son los UUIDs reales de `event_corner.users`, para
 * que `getDevicesByUser` devuelva algo y el mapeo a `assigned_user` del
 * gateway no quede en null.
 *
 * Al añadir un dispositivo al micorner, añadirlo también acá. Los valores de
 * `tipo`, `marca` y `modelo` viajan tal cual hasta `device_type`, `brand` y
 * `model` en el micorner (minerva → MinervaConnector.mapDevice →
 * InventoryOutboundController), así que conviene que coincidan para que la
 * sincronización no reescriba los datos con otros distintos.
 */
const seedDevices: Device[] = [
  seedDevice({
    nombre: 'Laptop Corporativa',
    serialNumber: 'SNDL5420001',
    descripcion: 'Dell Latitude asignada a soporte',
    tipo: 'LAPTOP',
    marca: 'DELL',
    modelo: 'Latitude 5420',
    usuarioId: '1855eb85-2769-4ae9-822a-c7848508c98a',
    usuarioNombre: 'Roberto Mendez',
  }),
  seedDevice({
    nombre: 'Laptop Corporativa',
    serialNumber: 'SNHP840002',
    descripcion: 'HP EliteBook de uso general',
    tipo: 'LAPTOP',
    marca: 'HP',
    modelo: 'EliteBook 840',
    usuarioId: '51d2e0ba-6b28-4bed-b79c-110e3658bade',
    usuarioNombre: 'Mairon Cuello',
  }),
  seedDevice({
    nombre: 'Telefono Corporativo',
    serialNumber: 'SNIP13001',
    descripcion: 'iPhone 13 de administracion',
    tipo: 'CELULAR',
    marca: 'APPLE',
    modelo: 'iPhone 13',
    usuarioId: '005f4b20-f13f-4c7f-ac8c-a07fafe5a858',
    usuarioNombre: 'Admin',
  }),
  seedDevice({
    nombre: 'Telefono Corporativo',
    serialNumber: 'XLM2015',
    descripcion: 'Terminal Sangsung XLM-2015',
    tipo: 'CELULAR',
    marca: 'SANGSUNG',
    modelo: 'XLM-2015',
    usuarioId: '51d2e0ba-6b28-4bed-b79c-110e3658bade',
    usuarioNombre: 'Mairon Cuello',
  }),
  seedDevice({
    nombre: 'Telefono Corporativo',
    serialNumber: 'XLM201523',
    descripcion: 'Terminal Sangsung XLM-UIGFD',
    tipo: 'CELULAR',
    marca: 'SANGSUNG',
    modelo: 'XLM-UIGFD',
    usuarioId: 'c2d8902d-112c-415f-8f30-7cca720ed265',
    usuarioNombre: 'Laura González',
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
