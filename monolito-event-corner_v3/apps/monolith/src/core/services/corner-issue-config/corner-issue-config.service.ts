import { Injectable } from '@nestjs/common';
import { Result } from '@app/result';
import { ICompanyIssueConfigRepository } from '../../ports/outgoing/repositories/corner-issue-config-repository.port';
import { CompanyIssueConfig } from '../../domain/entities/corner-issue-config.entity';
import { ServiceNowGroup } from '../../domain/value-objects/servicenow-group.value';
import { CompanyId, CompanyIssueConfigId, IssueTypeId } from '@app/shared/types/branded-ids';
import { TracingService } from '@app/observability';

export interface CreateCompanyIssueConfigCommand {
    companyId: string;
    issueTypeId: string;
    servicenowGroup: string;
    workMinutesOverride?: number;
}

export interface UpdateCompanyIssueConfigCommand {
    servicenowGroup?: string;
    workMinutesOverride?: number | null;
}

@Injectable()
export class CompanyIssueConfigService {
    constructor(
        private readonly repo: ICompanyIssueConfigRepository,
        private readonly tracing: TracingService,
    ) {}

    async create(command: CreateCompanyIssueConfigCommand): Promise<Result<CompanyIssueConfig>> {
        return this.tracing.run(
            'monolith.create',
            { kind: 'server', attributes: { 'cic.companyId': command.companyId, 'cic.issueTypeId': command.issueTypeId } },
            () => this._create(command),
        );
    }

    private async _create(command: CreateCompanyIssueConfigCommand): Promise<Result<CompanyIssueConfig>> {
        const groupResult = ServiceNowGroup.create(command.servicenowGroup);
        if (groupResult.isFailure) return Result.err(groupResult.unwrapError());

        const existing = await this.repo.findByCompanyAndIssueType(
            CompanyId(command.companyId),
            IssueTypeId(command.issueTypeId),
        );
        if (existing.isFailure) return Result.err(existing.unwrapError());
        if (existing.unwrap()) return Result.err(new Error('Config already exists for this company+issueType combination'));

        const config = CompanyIssueConfig.create(
            CompanyIssueConfigId(crypto.randomUUID()),
            CompanyId(command.companyId),
            IssueTypeId(command.issueTypeId),
            groupResult.unwrap(),
            command.workMinutesOverride,
        );
        if (config.isFailure) return Result.err(config.unwrapError());

        const saveResult = await this.repo.save(config.unwrap());
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        return Result.ok(config.unwrap());
    }

    async getByCompany(companyId: string): Promise<Result<CompanyIssueConfig[]>> {
        return this.repo.findByCompany(CompanyId(companyId));
    }

    async getByCompanyAndIssueType(companyId: string, issueTypeId: string): Promise<Result<CompanyIssueConfig | null>> {
        return this.repo.findByCompanyAndIssueType(CompanyId(companyId), IssueTypeId(issueTypeId));
    }

    async update(id: string, command: UpdateCompanyIssueConfigCommand): Promise<Result<CompanyIssueConfig>> {
        return this.tracing.run(
            'monolith.update',
            { kind: 'server', attributes: { 'cic.id': id } },
            () => this._update(id, command),
        );
    }

    private async _update(id: string, command: UpdateCompanyIssueConfigCommand): Promise<Result<CompanyIssueConfig>> {
        const configResult = await this.repo.findById(id);
        if (configResult.isFailure) return Result.err(configResult.unwrapError());
        const config = configResult.unwrap();
        if (!config) return Result.err(new Error(`CompanyIssueConfig ${id} not found`));

        if (command.servicenowGroup !== undefined) {
            const groupResult = ServiceNowGroup.create(command.servicenowGroup);
            if (groupResult.isFailure) return Result.err(groupResult.unwrapError());
            config.updateServiceNowGroup(groupResult.unwrap());
        }

        if (command.workMinutesOverride !== undefined) {
            config.updateWorkMinutesOverride(command.workMinutesOverride);
        }

        const updateResult = await this.repo.update(config);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(config);
    }

    async delete(id: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.delete',
            { kind: 'server', attributes: { 'cic.id': id } },
            () => this._delete(id),
        );
    }

    private async _delete(id: string): Promise<Result<void>> {
        const configResult = await this.repo.findById(id);
        if (configResult.isFailure) return Result.err(configResult.unwrapError());
        if (!configResult.unwrap()) return Result.err(new Error(`CompanyIssueConfig ${id} not found`));
        return this.repo.delete(id);
    }
}
