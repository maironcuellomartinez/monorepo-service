import { Result } from '@app/result';
import { Company } from '../../../domain/entities/company.entity';

export interface CreateCompanyCommand {
    name: string;
    /** Obligatorio — las compañías solo se crean vía sync desde un perfil de ServiceNow. */
    profileId: string;
    treeId?: string | null;
}

export interface UpdateCompanyCommand {
    treeId?: string | null;
    isActive?: boolean;
}

export interface ICompanyService {
    createCompany(command: CreateCompanyCommand): Promise<Result<Company>>;
    updateCompany(id: string, command: UpdateCompanyCommand): Promise<Result<Company>>;
    assignTree(companyId: string, treeId: string): Promise<Result<void>>;
    getCompany(id: string): Promise<Result<Company | null>>;
    getCompanyByName(name: string): Promise<Result<Company | null>>;
    listCompanies(): Promise<Result<Company[]>>;
}
