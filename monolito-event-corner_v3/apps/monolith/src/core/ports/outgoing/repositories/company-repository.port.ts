import { Result } from '@app/result';
import { Company } from '../../../domain/entities/company.entity';
import { CompanyId } from '../../../domain/value-objects/ids';
import { COMPANY_REPOSITORY } from './tokens';

export interface ICompanyRepository {
    save(company: Company): Promise<Result<void>>;
    findById(id: CompanyId | string): Promise<Result<Company | null>>;
    findByName(name: string): Promise<Result<Company | null>>;
    findAllActive(): Promise<Result<Company[]>>;
    update(company: Company): Promise<Result<void>>;
    delete(id: CompanyId | string): Promise<Result<void>>;

    // Métodos específicos
    findByTreeId(treeId: string): Promise<Result<Company[]>>;
    findByProfileId(profileId: string): Promise<Result<Company | null>>;
    getProfileId(companyId: string): Promise<Result<string | null>>;
}

export { COMPANY_REPOSITORY };
