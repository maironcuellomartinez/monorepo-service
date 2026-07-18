// infrastructure/persistence/typeorm/repositories/servicenow-profile.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IServiceNowProfileRepository } from '../../../../core/ports/outgoing/repositories/servicenow-profile-repository.port';
import { ServiceNowProfileEntity } from '../entities/servicenow-profile.entity';
import { ServiceNowProfile } from '../../../../core/domain/entities/servicenow-profile.entity';
import { ServiceNowProfileId } from '../../../../core/domain/value-objects/ids';
import { ServiceNowId } from '../../../../core/domain/value-objects/servicenow-id.value';
import { ServiceNowProfileAlreadyExistsError } from '../../../../core/domain/errors/incident.errors';
import { Result } from '@app/result';

// MySQL: código de error del driver para violación de unique index (mysql2 copia
// `code`/`errno` sobre el QueryFailedError de TypeORM).
function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY';
}

@Injectable()
export class TypeOrmServiceNowProfileRepository implements IServiceNowProfileRepository {
  constructor(
    @InjectRepository(ServiceNowProfileEntity)
    private readonly repo: Repository<ServiceNowProfileEntity>,
  ) {}

  async save(profile: ServiceNowProfile): Promise<Result<void>> {
    try {
      const entity = this.toEntity(profile);
      await this.repo.save(entity);
      return Result.ok(undefined);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return Result.err(
          new ServiceNowProfileAlreadyExistsError(
            profile.snowCompanySysId.value,
          ),
        );
      }
      return Result.err(error);
    }
  }

  async findById(
    id: ServiceNowProfileId | string,
  ): Promise<Result<ServiceNowProfile | null>> {
    try {
      const entity = await this.repo.findOne({
        where: { profile_id: id.toString() },
      });
      if (!entity) return Result.ok(null);
      const domain = this.toDomain(entity);
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByName(name: string): Promise<Result<ServiceNowProfile | null>> {
    try {
      const entity = await this.repo.findOne({
        where: { name },
      });
      if (!entity) return Result.ok(null);
      const domain = this.toDomain(entity);
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findAllActive(): Promise<Result<ServiceNowProfile[]>> {
    try {
      const entities = await this.repo.find({
        where: { is_active: true },
        order: { name: 'ASC' },
      });
      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async update(profile: ServiceNowProfile): Promise<Result<void>> {
    try {
      const entity = this.toEntity(profile);
      await this.repo.update(
        { profile_id: entity.profile_id },
        {
          name: entity.name,
          snow_company_sys_id: entity.snow_company_sys_id,
          snow_company_name: entity.snow_company_name,
          is_active: entity.is_active,
          updated_at: entity.updated_at,
        },
      );
      return Result.ok(undefined);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return Result.err(
          new ServiceNowProfileAlreadyExistsError(
            profile.snowCompanySysId.value,
          ),
        );
      }
      return Result.err(error);
    }
  }

  async delete(id: ServiceNowProfileId | string): Promise<Result<void>> {
    try {
      // Soft delete: marcar como inactivo
      await this.repo.update(
        { profile_id: id.toString() },
        { is_active: false, updated_at: new Date() },
      );
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByCompanySysId(
    sysId: string,
  ): Promise<Result<ServiceNowProfile | null>> {
    try {
      const entity = await this.repo.findOne({
        where: { snow_company_sys_id: sysId },
      });
      if (!entity) return Result.ok(null);
      const domain = this.toDomain(entity);
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  // Mapeadores
  private toEntity(domain: ServiceNowProfile): ServiceNowProfileEntity {
    const entity = new ServiceNowProfileEntity();
    entity.profile_id = domain.id.toString();
    entity.name = domain.name;
    entity.snow_company_sys_id = domain.snowCompanySysId.value;
    entity.snow_company_name = domain.snowCompanyName;
    entity.is_active = domain.isActive;
    entity.created_at = domain.createdAt;
    entity.updated_at = domain.updatedAt;
    return entity;
  }

  private toDomain(entity: ServiceNowProfileEntity): ServiceNowProfile {
    const snowCompanySysIdResult = ServiceNowId.create(
      entity.snow_company_sys_id,
    );
    if (snowCompanySysIdResult.isFailure) {
      throw new Error(
        `Invalid ServiceNow ID in database: ${entity.snow_company_sys_id}`,
      );
    }

    return ServiceNowProfile.reconstitute(
      ServiceNowProfileId(entity.profile_id),
      entity.name,
      snowCompanySysIdResult.unwrap(),
      entity.snow_company_name,
      entity.is_active,
      entity.created_at,
      entity.updated_at,
    );
  }
}
