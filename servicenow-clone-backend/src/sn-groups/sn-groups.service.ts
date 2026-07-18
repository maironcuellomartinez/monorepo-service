import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SnGroupEntity } from './sn-group.entity';

export interface CreateSnGroupDto {
  name: string;
  type?: string;
  email?: string;
  description?: string;
  location?: string;
}

export interface UpdateSnGroupDto {
  name?: string;
  type?: string;
  email?: string;
  description?: string;
  location?: string;
  is_active?: boolean;
}

@Injectable()
export class SnGroupsService {
  constructor(
    @InjectRepository(SnGroupEntity)
    private readonly repo: Repository<SnGroupEntity>,
  ) {}

  async findAll(activeOnly = true): Promise<SnGroupEntity[]> {
    const where = activeOnly ? { is_active: true } : {};
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async findBySysId(sys_id: string): Promise<SnGroupEntity> {
    const group = await this.repo.findOne({ where: { sys_id } });
    if (!group) throw new NotFoundException(`SN group ${sys_id} not found`);
    return group;
  }

  async exists(sys_id: string): Promise<boolean> {
    const count = await this.repo.count({ where: { sys_id, is_active: true } });
    return count > 0;
  }

  async create(dto: CreateSnGroupDto): Promise<SnGroupEntity> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing)
      throw new ConflictException(`A group named "${dto.name}" already exists`);

    const entity = this.repo.create({
      sys_id: randomUUID(),
      name: dto.name,
      type: dto.type ?? 'itil',
      email: dto.email ?? null,
      description: dto.description ?? null,
      location: dto.location ?? null,
      is_active: true,
    });
    return this.repo.save(entity);
  }

  async update(sys_id: string, dto: UpdateSnGroupDto): Promise<SnGroupEntity> {
    const group = await this.findBySysId(sys_id);
    Object.assign(group, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.is_active !== undefined && { is_active: dto.is_active }),
    });
    return this.repo.save(group);
  }

  async deactivate(sys_id: string): Promise<void> {
    const group = await this.findBySysId(sys_id);
    group.is_active = false;
    await this.repo.save(group);
  }
}
