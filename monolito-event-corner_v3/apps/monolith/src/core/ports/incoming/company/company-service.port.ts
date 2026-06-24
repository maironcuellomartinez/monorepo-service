import { Result } from '@app/result';
import { Company } from '../../../domain/entities/company.entity';

export interface CreateCompanyCommand {
    name: string;
    treeId: string;
    profileId?: string | null;
}

export interface UpdateCompanyCommand {
    name?: string;
    treeId?: string;
    profileId?: string | null;
    isActive?: boolean;
}

export interface ICompanyService {
    createCompany(command: CreateCompanyCommand): Promise<Result<Company>>;
    updateCompany(id: string, command: UpdateCompanyCommand): Promise<Result<Company>>;
    assignServiceNowProfile(companyId: string, profileId: string | null): Promise<Result<void>>;
    assignTree(companyId: string, treeId: string): Promise<Result<void>>;
    getCompany(id: string): Promise<Result<Company | null>>;
    getCompanyByName(name: string): Promise<Result<Company | null>>;
    listCompanies(): Promise<Result<Company[]>>;
}
