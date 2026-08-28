import { Result } from '@app/result';
import { ServiceNowProfile } from '../../../domain/entities/servicenow-profile.entity';
import { ServiceNowProfileId } from '@app/shared/types/branded-ids';

export interface IServiceNowProfileRepository {
    save(profile: ServiceNowProfile): Promise<Result<void>>;
    findById(id: ServiceNowProfileId): Promise<Result<ServiceNowProfile | null>>;
    findByName(name: string): Promise<Result<ServiceNowProfile | null>>;
    findAllActive(): Promise<Result<ServiceNowProfile[]>>;
    update(profile: ServiceNowProfile): Promise<Result<void>>;
    delete(id: ServiceNowProfileId): Promise<Result<void>>;
    findByCompanySysId(sysId: string): Promise<Result<ServiceNowProfile | null>>;
}