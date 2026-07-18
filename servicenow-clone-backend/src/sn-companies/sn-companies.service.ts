import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SnCompanyEntity } from './sn-company.entity';

export interface CreateSnCompanyDto {
  name: string;
  short_name?: string;
  country?: string;
  city?: string;
  notes?: string;
}

export interface UpdateSnCompanyDto {
  name?: string;
  short_name?: string;
  country?: string;
  city?: string;
  notes?: string;
  is_active?: boolean;
}

@Injectable()
export class SnCompaniesService {
  constructor(
    @InjectRepository(SnCompanyEntity)
    private readonly repo: Repository<SnCompanyEntity>,
  ) {}

  async findAll(): Promise<SnCompanyEntity[]> {
    return this.repo.find({
      where: { is_active: true },
      order: { name: 'ASC' },
    });
  }

  async findBySysId(sys_id: string): Promise<SnCompanyEntity> {
    const company = await this.repo.findOne({ where: { sys_id } });
    if (!company) throw new NotFoundException(`SN company ${sys_id} not found`);
    return company;
  }

  async create(dto: CreateSnCompanyDto): Promise<SnCompanyEntity> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing)
      throw new ConflictException(
        `A company named "${dto.name}" already exists`,
      );

    const entity = this.repo.create({
      sys_id: randomUUID(),
      name: dto.name,
      short_name: dto.short_name ?? null,
      country: dto.country ?? null,
      city: dto.city ?? null,
      notes: dto.notes ?? null,
      is_active: true,
    });
    return this.repo.save(entity);
  }

  async update(
    sys_id: string,
    dto: UpdateSnCompanyDto,
  ): Promise<SnCompanyEntity> {
    const company = await this.findBySysId(sys_id);
    Object.assign(company, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.short_name !== undefined && { short_name: dto.short_name }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.is_active !== undefined && { is_active: dto.is_active }),
    });
    return this.repo.save(company);
  }

  async deactivate(sys_id: string): Promise<void> {
    const company = await this.findBySysId(sys_id);
    company.is_active = false;
    await this.repo.save(company);
  }
}
