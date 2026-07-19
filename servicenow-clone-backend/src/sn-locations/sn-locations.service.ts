import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SnLocationEntity } from './sn-location.entity';

export interface CreateSnLocationDto {
  name: string;
  city?: string;
  country?: string;
  description?: string;
}

export interface UpdateSnLocationDto {
  name?: string;
  city?: string;
  country?: string;
  description?: string;
  is_active?: boolean;
}

@Injectable()
export class SnLocationsService {
  constructor(
    @InjectRepository(SnLocationEntity)
    private readonly repo: Repository<SnLocationEntity>,
  ) {}

  async findAll(activeOnly = true): Promise<SnLocationEntity[]> {
    const where = activeOnly ? { is_active: true } : {};
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async findBySysId(sys_id: string): Promise<SnLocationEntity> {
    const loc = await this.repo.findOne({ where: { sys_id } });
    if (!loc) throw new NotFoundException(`SN location ${sys_id} not found`);
    return loc;
  }

  async create(dto: CreateSnLocationDto): Promise<SnLocationEntity> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing)
      throw new ConflictException(
        `A location named "${dto.name}" already exists`,
      );

    const entity = this.repo.create({
      sys_id: randomUUID(),
      name: dto.name,
      city: dto.city ?? null,
      country: dto.country ?? null,
      description: dto.description ?? null,
      is_active: true,
    });
    return this.repo.save(entity);
  }

  async update(
    sys_id: string,
    dto: UpdateSnLocationDto,
  ): Promise<SnLocationEntity> {
    const loc = await this.findBySysId(sys_id);
    Object.assign(loc, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.is_active !== undefined && { is_active: dto.is_active }),
    });
    return this.repo.save(loc);
  }

  async deactivate(sys_id: string): Promise<void> {
    const loc = await this.findBySysId(sys_id);
    loc.is_active = false;
    await this.repo.save(loc);
  }
}
