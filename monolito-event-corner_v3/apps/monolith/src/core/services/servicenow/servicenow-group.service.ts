import { Injectable } from '@nestjs/common';
import { IServiceNowGroupRepository, ServiceNowGroupRecord } from '../../ports/outgoing/repositories/servicenow-group-repository.port';
import { Result } from '@app/result';

// NOTE: This service accesses the repository interface defined in core/ports/outgoing.
// It's intentionally lightweight since servicenow_groups is a catalog, not a rich domain.

@Injectable()
export class ServiceNowGroupService {
    constructor(private readonly repo: IServiceNowGroupRepository) {}

    async findAll(): Promise<Result<ServiceNowGroupRecord[]>> {
        return this.repo.findAll();
    }

    async register(groupName: string, description?: string): Promise<Result<void>> {
        const existing = await this.repo.findByName(groupName);
        if (existing.isFailure) return Result.err(existing.unwrapError());
        if (existing.unwrap()) return Result.err(new Error(`Group '${groupName}' is already registered`));

        return this.repo.save(crypto.randomUUID(), groupName, description);
    }

    async update(groupId: string, data: { description?: string; isActive?: boolean }): Promise<Result<void>> {
        return this.repo.update(groupId, data);
    }

    async delete(groupId: string): Promise<Result<void>> {
        return this.repo.delete(groupId);
    }

    async isKnownGroup(groupName: string): Promise<Result<boolean>> {
        return this.repo.isKnownGroup(groupName);
    }
}
