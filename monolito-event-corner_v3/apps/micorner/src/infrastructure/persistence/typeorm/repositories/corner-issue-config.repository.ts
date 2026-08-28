import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ICompanyIssueConfigRepository } from '../../../../core/ports/outgoing/repositories/corner-issue-config-repository.port';
import { CompanyIssueConfigEntity } from '../entities/corner-issue-config.entity';
import { CompanyIssueConfig } from '../../../../core/domain/entities/corner-issue-config.entity';
import { CompanyId, CompanyIssueConfigId, IssueTypeId } from '@app/shared/types/branded-ids';
import { ServiceNowGroup } from '../../../../core/domain/value-objects/servicenow-group.value';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmCompanyIssueConfigRepository implements ICompanyIssueConfigRepository {
    constructor(
        @InjectRepository(CompanyIssueConfigEntity)
        private readonly repo: Repository<CompanyIssueConfigEntity>,
    ) {}

    async save(config: CompanyIssueConfig): Promise<Result<void>> {
        try {
            await this.repo.save(this.toEntity(config));
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async findById(id: string): Promise<Result<CompanyIssueConfig | null>> {
        try {
            const entity = await this.repo.findOne({ where: { config_id: id } });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async findByCompanyAndIssueType(companyId: CompanyId, issueTypeId: IssueTypeId): Promise<Result<CompanyIssueConfig | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { company_id: companyId.toString(), issue_type_id: issueTypeId.toString() },
            });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async findByCompany(companyId: CompanyId): Promise<Result<CompanyIssueConfig[]>> {
        try {
            const entities = await this.repo.find({ where: { company_id: companyId.toString() } });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async update(config: CompanyIssueConfig): Promise<Result<void>> {
        try {
            await this.repo.update(
                { config_id: config.id.toString() },
                {
                    servicenow_group: config.servicenowGroup.value,
                    work_minutes_override: config.workMinutesOverride,
                },
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            await this.repo.delete({ config_id: id });
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async getServiceNowGroup(companyId: CompanyId, issueTypeId: IssueTypeId): Promise<Result<string | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { company_id: companyId.toString(), issue_type_id: issueTypeId.toString() },
                select: ['servicenow_group'],
            });
            return Result.ok(entity?.servicenow_group ?? null);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    private toEntity(domain: CompanyIssueConfig): CompanyIssueConfigEntity {
        const entity = new CompanyIssueConfigEntity();
        entity.config_id = domain.id.toString();
        entity.company_id = domain.companyId.toString();
        entity.issue_type_id = domain.issueTypeId.toString();
        entity.servicenow_group = domain.servicenowGroup.value;
        entity.work_minutes_override = domain.workMinutesOverride;
        entity.created_at = domain.createdAt;
        return entity;
    }

    private toDomain(entity: CompanyIssueConfigEntity): CompanyIssueConfig {
        const groupResult = ServiceNowGroup.create(entity.servicenow_group);
        if (groupResult.isFailure) throw new Error(`Invalid servicenow_group in DB: ${entity.servicenow_group}`);
        return CompanyIssueConfig.reconstitute(
            entity.config_id as CompanyIssueConfigId,
            entity.company_id as CompanyId,
            entity.issue_type_id as IssueTypeId,
            groupResult.unwrap(),
            entity.work_minutes_override,
            entity.created_at,
        );
    }
}
