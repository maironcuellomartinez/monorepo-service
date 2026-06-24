import { Result } from '@app/result';
import { ServiceNowProfile } from '../../../domain/entities/servicenow-profile.entity';
import { ServiceNowProfileId } from '../../../domain/value-objects/ids';

export interface CreateProfileCommand {
    name: string;
    snowCompanySysId: ServiceNowProfileId;
    snowCompanyName: string;
}

export interface UpdateProfileCommand {
    name?: string;
    snowCompanyName?: string;
    snowCompanySysId?: string;
    isActive?: boolean;
}

export interface IServiceNowProfileService {
    createProfile(command: CreateProfileCommand): Promise<Result<ServiceNowProfile>>;
    updateProfile(id: string, command: UpdateProfileCommand): Promise<Result<ServiceNowProfile>>;
    getProfile(id: string): Promise<Result<ServiceNowProfile | null>>;
    getAllProfiles(): Promise<Result<ServiceNowProfile[]>>;
}
