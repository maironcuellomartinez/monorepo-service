import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './device.entity';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/create-device.dto';

@Injectable()
export class DevicesRepository {
  constructor(
    @InjectRepository(Device)
    private readonly repository: Repository<Device>,
  ) {}

  async create(dto: CreateDeviceDto): Promise<Device> {
    const device = this.repository.create(dto);
    return this.repository.save(device);
  }

  async findById(deviceId: string): Promise<Device | null> {
    return this.repository.findOne({
      where: { deviceId },
    });
  }

  async findBySerialNumber(serialNumber: string): Promise<Device | null> {
    return this.repository.findOne({
      where: { serialNumber },
    });
  }

  async findByUsuarioId(usuarioId: string): Promise<Device[]> {
    return this.repository.find({
      where: { usuarioId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Device[]> {
    return this.repository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async update(deviceId: string, dto: UpdateDeviceDto): Promise<Device | null> {
    await this.repository.update(deviceId, dto);
    return this.repository.findOne({ where: { deviceId } });
  }

  async delete(deviceId: string): Promise<boolean> {
    const result = await this.repository.delete(deviceId);
    return result.affected !== 0;
  }
}
