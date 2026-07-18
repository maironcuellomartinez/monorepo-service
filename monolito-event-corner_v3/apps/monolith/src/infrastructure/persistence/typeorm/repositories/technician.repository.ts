// infrastructure/persistence/typeorm/repositories/technician.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
import { ITechnicianRepository } from '../../../../core/ports/outgoing/repositories/technician-repository.port';
import { TechnicianEntity } from '../entities/technician.entity';
import { Technician } from '../../../../core/domain/entities/technician.entity';
import {
  TechnicianId,
  CornerId,
  UserId,
} from '../../../../core/domain/value-objects/ids';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmTechnicianRepository implements ITechnicianRepository {
  constructor(
    @InjectRepository(TechnicianEntity)
    private readonly repo: Repository<TechnicianEntity>,
  ) {}

  async save(technician: Technician): Promise<Result<void>> {
    try {
      const entity = this.toEntity(technician);
      await this.repo.save(entity);
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findById(
    id: TechnicianId | string,
  ): Promise<Result<Technician | null>> {
    try {
      const entity = await this.repo.findOne({
        where: { technician_id: id.toString() },
      });
      if (!entity) return Result.ok(null);
      const domain = this.toDomain(entity);
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findAll(): Promise<Result<Technician[]>> {
    try {
      // user_id IS NULL == técnico removido (deleteTechnician hace soft-delete +
      // unlinkUser por integridad referencial con incident_timeline) — no debe
      // reaparecer en el listado. Distinto de un deshabilitado manual (disabled=true,
      // user_id no nulo), que sí debe listarse para poder reactivarlo.
      const entities = await this.repo.find({
        where: { user_id: Not(IsNull()) },
        order: { name: 'ASC' },
      });
      return Result.ok(entities.map((e) => this.toDomain(e)));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByCorner(
    cornerId: string | CornerId,
  ): Promise<Result<Technician[]>> {
    try {
      const entities = await this.repo.find({
        where: { corner_id: cornerId.toString(), disabled: false },
        order: { name: 'ASC' },
      });
      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByUserId(userId: string): Promise<Result<Technician | null>> {
    try {
      const entity = await this.repo.findOne({ where: { user_id: userId } });
      if (!entity) return Result.ok(null);
      return Result.ok(this.toDomain(entity));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByEmail(email: string): Promise<Result<Technician | null>> {
    try {
      const entity = await this.repo.findOne({
        where: { email },
      });
      if (!entity) return Result.ok(null);
      const domain = this.toDomain(entity);
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findAvailableByCorner(cornerId: string): Promise<Result<Technician[]>> {
    try {
      const entities = await this.repo.find({
        where: { corner_id: cornerId, disabled: false },
        order: { name: 'ASC' },
      });
      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async update(technician: Technician): Promise<Result<void>> {
    try {
      const entity = this.toEntity(technician);
      await this.repo.update(
        { technician_id: entity.technician_id },
        {
          user_id: entity.user_id,
          name: entity.name,
          last_name: entity.last_name,
          full_name: entity.full_name,
          email: entity.email,
          corner_id: entity.corner_id ?? null,
          disabled: entity.disabled,
          updated_at: entity.updated_at,
        },
      );
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async delete(id: TechnicianId | string): Promise<Result<void>> {
    try {
      await this.repo.delete({ technician_id: id.toString() });
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByIds(ids: string[]): Promise<Result<Technician[]>> {
    try {
      const entities = await this.repo.find({
        where: { technician_id: In(ids), disabled: false },
      });
      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  private toEntity(domain: Technician): TechnicianEntity {
    const entity = new TechnicianEntity();
    entity.technician_id = domain.id.toString();
    entity.user_id = domain.userId?.toString() ?? null;
    entity.name = domain.name;
    entity.last_name = domain.lastName;
    entity.full_name = domain.fullName;
    entity.email = domain.email;
    entity.corner_id = domain.cornerId?.toString() ?? null;
    entity.disabled = domain.disabled;
    entity.created_at = domain.createdAt;
    entity.updated_at = domain.updatedAt;
    return entity;
  }

  private toDomain(entity: TechnicianEntity): Technician {
    return Technician.reconstitute(
      TechnicianId(entity.technician_id),
      entity.name,
      entity.last_name,
      entity.full_name,
      entity.email,
      entity.corner_id ? CornerId(entity.corner_id) : null,
      entity.disabled,
      entity.created_at,
      entity.updated_at,
      entity.user_id ? UserId(entity.user_id) : null,
    );
  }
}
