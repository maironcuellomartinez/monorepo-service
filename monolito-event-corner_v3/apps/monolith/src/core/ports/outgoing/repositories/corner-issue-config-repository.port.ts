import { Result } from '@app/result';
import { CompanyIssueConfig } from '../../../domain/entities/corner-issue-config.entity';
import { CompanyId, IssueTypeId } from '@app/shared/types/branded-ids';

export interface ICompanyIssueConfigRepository {
    save(config: CompanyIssueConfig): Promise<Result<void>>;
    findById(id: string): Promise<Result<CompanyIssueConfig | null>>;
    findByCompanyAndIssueType(companyId: CompanyId, issueTypeId: IssueTypeId): Promise<Result<CompanyIssueConfig | null>>;
    findByCompany(companyId: CompanyId): Promise<Result<CompanyIssueConfig[]>>;
    update(config: CompanyIssueConfig): Promise<Result<void>>;
    delete(id: string): Promise<Result<void>>;
    getServiceNowGroup(companyId: CompanyId, issueTypeId: IssueTypeId): Promise<Result<string | null>>;
}
