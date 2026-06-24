// core/services/servicenow/profile.service.ts
import { Injectable } from '@nestjs/common';
import { IServiceNowProfileService, CreateProfileCommand, UpdateProfileCommand } from '../../ports/incoming/servicenow/profile-service.port';
import { IServiceNowProfileRepository } from '../../ports/outgoing/repositories/servicenow-profile-repository.port';
import { Result } from '@app/result';
import { ServiceNowProfile } from '../../domain/entities/servicenow-profile.entity';
import { ServiceNowProfileId } from '../../domain/value-objects/ids';
import { ServiceNowId } from '../../domain/value-objects/servicenow-id.value';
import { DomainError } from '../../domain/errors/domain-error';

@Injectable()
export class ServiceNowProfileService implements IServiceNowProfileService {
    constructor(private readonly profileRepo: IServiceNowProfileRepository) { }

    async createProfile(command: CreateProfileCommand): Promise<Result<ServiceNowProfile>> {
        const snowCompanySysIdResult = ServiceNowId.create(command.snowCompanySysId);
        if (snowCompanySysIdResult.isFailure) return Result.err(snowCompanySysIdResult.unwrapError());

        const profileId = crypto.randomUUID() as unknown as ServiceNowProfileId;
        const profileResult = ServiceNowProfile.create(
            profileId,
            command.name,
            snowCompanySysIdResult.unwrap(),
            command.snowCompanyName,
        );
        if (profileResult.isFailure) return profileResult;

        const profile = profileResult.unwrap();
        const saveResult = await this.profileRepo.save(profile);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        return Result.ok(profile);
    }

    async updateProfile(id: ServiceNowProfileId, command: UpdateProfileCommand): Promise<Result<ServiceNowProfile>> {
        const profileResult = await this.profileRepo.findById(id);
        if (profileResult.isFailure) return Result.err(profileResult.unwrapError());

        const profile = profileResult.unwrap();
        if (!profile) {
            return Result.err(new Error(`Profile ${id} not found`));
        }

        let newSnowCompanySysId = profile.snowCompanySysId;
        if (command.snowCompanySysId) {
            const sysIdResult = ServiceNowId.create(command.snowCompanySysId);
            if (sysIdResult.isFailure) return Result.err(sysIdResult.unwrapError());
            newSnowCompanySysId = sysIdResult.unwrap();
        }

        profile.update(
            command.name ?? profile.name,
            newSnowCompanySysId,
            command.snowCompanyName ?? profile.snowCompanyName,
        );

        if (command.isActive !== undefined) {
            if (command.isActive) profile.activate(); else profile.deactivate();
        }

        const updateResult = await this.profileRepo.update(profile);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(profile);
    }

    async getProfile(id: ServiceNowProfileId): Promise<Result<ServiceNowProfile | null>> {
        return this.profileRepo.findById(id);
    }

    async getAllProfiles(): Promise<Result<ServiceNowProfile[]>> {
        return this.profileRepo.findAllActive();
    }
}