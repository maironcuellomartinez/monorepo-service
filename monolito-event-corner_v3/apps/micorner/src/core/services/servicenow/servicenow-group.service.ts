import { Injectable } from '@nestjs/common';
import { IServiceNowGroupRepository, ServiceNowGroupRecord } from '../../ports/outgoing/repositories/servicenow-group-repository.port';
import { Result } from '@app/result';
import { TracingService } from '@app/observability';

// NOTE: This service accesses the repository interface defined in core/ports/outgoing.
// It's intentionally lightweight since servicenow_groups is a catalog, not a rich domain.

@Injectable()
export class ServiceNowGroupService {
    constructor(
        private readonly repo: IServiceNowGroupRepository,
        private readonly tracing: TracingService,
    ) {}

    async findAll(): Promise<Result<ServiceNowGroupRecord[]>> {
        return this.repo.findAll();
    }

    async register(groupId: string, groupName: string, description?: string): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.register',
            { kind: 'server', attributes: { 'snGroup.id': groupId, 'snGroup.name': groupName } },
            () => this._register(groupId, groupName, description),
        );
    }

    private async _register(groupId: string, groupName: string, description?: string): Promise<Result<void>> {
        const existing = await this.repo.findByName(groupName);
        if (existing.isFailure) return Result.err(existing.unwrapError());
        if (existing.unwrap()) return Result.err(new Error(`Group '${groupName}' is already registered`));

        // groupId debe ser el sys_id real del grupo en ServiceNow — es lo que
        // corners.snow_assignment_group / company_issue_configs.servicenow_group
        // terminan usando para rutear tickets, no un ID interno inventado.
        return this.repo.save(groupId, groupName, description);
    }

    async update(groupId: string, data: { description?: string; isActive?: boolean }): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.update',
            { kind: 'server', attributes: { 'snGroup.groupId': groupId } },
            () => this._update(groupId, data),
        );
    }

    private async _update(groupId: string, data: { description?: string; isActive?: boolean }): Promise<Result<void>> {
        return this.repo.update(groupId, data);
    }

    async delete(groupId: string): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.delete',
            { kind: 'server', attributes: { 'snGroup.groupId': groupId } },
            () => this._delete(groupId),
        );
    }

    private async _delete(groupId: string): Promise<Result<void>> {
        return this.repo.delete(groupId);
    }

    async isKnownGroup(groupName: string): Promise<Result<boolean>> {
        return this.repo.isKnownGroup(groupName);
    }

    /** Upsert masivo — usado para sincronizar el catálogo local con el vivo de ServiceNow. */
    async syncMany(
        groups: { groupId: string; groupName: string; description?: string }[],
    ): Promise<Result<number>> {
        return this.tracing.run(
            'micorner.syncManyGroups',
            { kind: 'server', attributes: { 'snGroups.count': String(groups.length) } },
            () => this._syncMany(groups),
        );
    }

    private async _syncMany(
        groups: { groupId: string; groupName: string; description?: string }[],
    ): Promise<Result<number>> {
        for (const g of groups) {
            const result = await this.repo.save(g.groupId, g.groupName, g.description);
            if (result.isFailure) return Result.err(result.unwrapError());
        }
        return Result.ok(groups.length);
    }
}
