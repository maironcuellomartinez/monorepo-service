import { Injectable } from '@nestjs/common';
import { ICompanyService, CreateCompanyCommand, UpdateCompanyCommand } from '../../ports/incoming/company/company-service.port';
import { ICompanyRepository } from '../../ports/outgoing/repositories/company-repository.port';
import { IIssueTypeTreeRepository } from '../../ports/outgoing/repositories/issue-type-tree-repository.port';
import { Result } from '@app/result';
import { Company } from '../../domain/entities/company.entity';
import { CompanyId, IssueTypeTreeId } from '../../domain/value-objects/ids';
import { ServiceNowProfileId } from '@app/shared/types/branded-ids';
import { IssueTypeTreeNotFoundError, CompanyAlreadyLinkedError } from '@app/shared/errors/domain-error';
import { TracingService } from '@app/observability';

@Injectable()
export class CompanyService implements ICompanyService {
    constructor(
        private readonly companyRepo: ICompanyRepository,
        private readonly treeRepo: IIssueTypeTreeRepository,
        private readonly tracing: TracingService,
    ) { }

    async createCompany(command: CreateCompanyCommand): Promise<Result<Company>> {
        return this.tracing.run(
            'monolith.createCompany',
            { kind: 'server', attributes: { 'company.name': command.name } },
            () => this._createCompany(command),
        );
    }

    private async _createCompany(command: CreateCompanyCommand): Promise<Result<Company>> {
        // Validar el árbol solo si se proveyó — una compañía recién sincronizada
        // desde SN puede quedar sin árbol hasta que el admin se lo asigne.
        if (command.treeId) {
            const treeResult = await this.treeRepo.findById(command.treeId);
            if (treeResult.isFailure) return Result.err(treeResult.unwrapError());
            if (!treeResult.unwrap()) {
                return Result.err(new IssueTypeTreeNotFoundError(command.treeId));
            }
        }

        const companyId = crypto.randomUUID() as unknown as CompanyId;
        const companyResult = Company.create(
            companyId,
            command.name,
            ServiceNowProfileId(command.profileId as any),
            command.treeId ? IssueTypeTreeId(command.treeId as any) : null,
        );
        if (companyResult.isFailure) return companyResult;

        const company = companyResult.unwrap();
        const saveResult = await this.companyRepo.save(company);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        return Result.ok(company);
    }

    async updateCompany(id: string, command: UpdateCompanyCommand): Promise<Result<Company>> {
        return this.tracing.run(
            'monolith.updateCompany',
            { kind: 'server', attributes: { 'company.id': id } },
            () => this._updateCompany(id, command),
        );
    }

    private async _updateCompany(id: string, command: UpdateCompanyCommand): Promise<Result<Company>> {
        const companyResult = await this.companyRepo.findById(id);
        if (companyResult.isFailure) return Result.err(companyResult.unwrapError());
        const company = companyResult.unwrap();
        if (!company) return Result.err(new Error(`Company ${id} not found`));

        if (command.treeId !== undefined) {
            if (command.treeId === null) {
                company.assignTree(null);
            } else {
                const treeResult = await this.treeRepo.findById(command.treeId);
                if (treeResult.isFailure) return Result.err(treeResult.unwrapError());
                if (!treeResult.unwrap()) return Result.err(new IssueTypeTreeNotFoundError(command.treeId));
                company.assignTree(IssueTypeTreeId(command.treeId as any));
            }
        }
        if (command.isActive !== undefined) {
            if (command.isActive) company.activate(); else company.deactivate();
        }

        const updateResult = await this.companyRepo.update(company);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(company);
    }

    async assignTree(companyId: string, treeId: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.assignTree',
            { kind: 'server', attributes: { 'company.id': companyId } },
            () => this._assignTree(companyId, treeId),
        );
    }

    private async _assignTree(companyId: string, treeId: string): Promise<Result<void>> {
        const treeResult = await this.treeRepo.findById(treeId);
        if (treeResult.isFailure) return Result.err(treeResult.unwrapError());
        if (!treeResult.unwrap()) return Result.err(new IssueTypeTreeNotFoundError(treeId));

        const companyResult = await this.companyRepo.findById(companyId);
        if (companyResult.isFailure) return Result.err(companyResult.unwrapError());
        const company = companyResult.unwrap();
        if (!company) return Result.err(new Error(`Company ${companyId} not found`));

        company.assignTree(IssueTypeTreeId(treeId as any));

        const updateResult = await this.companyRepo.update(company);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(undefined);
    }

    async linkServiceNowProfile(companyId: string, profileId: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.linkServiceNowProfile',
            { kind: 'server', attributes: { 'company.id': companyId } },
            () => this._linkServiceNowProfile(companyId, profileId),
        );
    }

    private async _linkServiceNowProfile(companyId: string, profileId: string): Promise<Result<void>> {
        const companyResult = await this.companyRepo.findById(companyId);
        if (companyResult.isFailure) return Result.err(companyResult.unwrapError());
        const company = companyResult.unwrap();
        if (!company) return Result.err(new Error(`Company ${companyId} not found`));

        if (company.profileId && company.profileId.toString() !== profileId) {
            return Result.err(new CompanyAlreadyLinkedError(companyId, company.profileId.toString()));
        }

        company.assignServiceNowProfile(ServiceNowProfileId(profileId as any));

        const updateResult = await this.companyRepo.update(company);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(undefined);
    }

    async getCompany(id: string): Promise<Result<Company | null>> {
        return this.companyRepo.findById(id);
    }

    async getCompanyByName(name: string): Promise<Result<Company | null>> {
        return this.companyRepo.findByName(name);
    }

    async listCompanies(): Promise<Result<Company[]>> {
        return this.companyRepo.findAllActive();
    }
}
