// infrastructure/persistence/typeorm/repositories/company.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ICompanyRepository } from '../../../../core/ports/outgoing/repositories/company-repository.port';
import { CompanyEntity } from '../entities/company.entity';
import { Company } from '../../../../core/domain/entities/company.entity';
import { CompanyId, IssueTypeTreeId } from '../../../../core/domain/value-objects/ids';
import { ServiceNowProfileId } from '@app/shared/types/branded-ids';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmCompanyRepository implements ICompanyRepository {
    constructor(
        @InjectRepository(CompanyEntity)
        private readonly repo: Repository<CompanyEntity>,
    ) { }

    async save(company: Company): Promise<Result<void>> {
        try {
            await this.repo.save(this.toEntity(company));
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findById(id: CompanyId | string): Promise<Result<Company | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { company_id: id.toString() },
                relations: ['snowProfile'],
            });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByName(name: string): Promise<Result<Company | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { name },
                relations: ['snowProfile'],
            });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findAllActive(): Promise<Result<Company[]>> {
        try {
            const entities = await this.repo.find({
                where: { is_active: true },
                relations: ['snowProfile'],
                order: { name: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async update(company: Company): Promise<Result<void>> {
        try {
            const entity = this.toEntity(company);
            await this.repo.update(
                { company_id: entity.company_id },
                {
                    name: entity.name,
                    tree_id: entity.tree_id,
                    profile_id: entity.profile_id,
                    is_active: entity.is_active,
                    updated_at: entity.updated_at,
                },
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async delete(id: CompanyId | string): Promise<Result<void>> {
        try {
            await this.repo.update(
                { company_id: id.toString() },
                { is_active: false, updated_at: new Date() },
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByTreeId(treeId: string): Promise<Result<Company[]>> {
        try {
            const entities = await this.repo.find({
                where: { tree_id: treeId, is_active: true },
                relations: ['snowProfile'],
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    /** Busca la compañía vinculada a un perfil SN — evita duplicar Company al re-sincronizar. */
    async findByProfileId(profileId: string): Promise<Result<Company | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { profile_id: profileId },
                relations: ['snowProfile'],
            });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error);
        }
    }

    /** Devuelve el profile_id de una empresa. Null = sin perfil SN asignado. */
    async getProfileId(companyId: string): Promise<Result<string | null>> {
        try {
            const entity = await this.repo.findOne({ where: { company_id: companyId } });
            return Result.ok(entity?.profile_id ?? null);
        } catch (error) {
            return Result.err(error);
        }
    }

    // ── Mapeadores ───────────────────────────────────────────────────────────

    private toEntity(domain: Company): CompanyEntity {
        const entity = new CompanyEntity();
        entity.company_id = domain.id.toString();
        entity.name = domain.name;
        entity.tree_id = domain.treeId?.toString() ?? null;
        entity.profile_id = domain.profileId?.toString() ?? null;
        entity.is_active = domain.isActive;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;
        return entity;
    }

    private toDomain(entity: CompanyEntity): Company {
        return Company.reconstitute(
            CompanyId(entity.company_id as any),
            entity.name,
            entity.tree_id ? IssueTypeTreeId(entity.tree_id as any) : null,
            entity.profile_id ? ServiceNowProfileId(entity.profile_id as any) : null,
            entity.is_active,
            entity.created_at,
            entity.updated_at,
        );
    }
}
