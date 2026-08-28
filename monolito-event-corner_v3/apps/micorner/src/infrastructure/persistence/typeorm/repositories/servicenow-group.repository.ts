import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceNowGroupEntity } from '../entities/servicenow-group.entity';
import { IServiceNowGroupRepository, ServiceNowGroupRecord } from '../../../../core/ports/outgoing/repositories/servicenow-group-repository.port';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmServiceNowGroupRepository implements IServiceNowGroupRepository {
    constructor(
        @InjectRepository(ServiceNowGroupEntity)
        private readonly repo: Repository<ServiceNowGroupEntity>,
    ) {}

    async findAll(): Promise<Result<ServiceNowGroupRecord[]>> {
        try {
            const entities = await this.repo.find({ order: { group_name: 'ASC' } });
            return Result.ok(entities.map(e => this.toRecord(e)));
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async findActive(): Promise<Result<ServiceNowGroupRecord[]>> {
        try {
            const entities = await this.repo.find({ where: { is_active: true }, order: { group_name: 'ASC' } });
            return Result.ok(entities.map(e => this.toRecord(e)));
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async findByName(groupName: string): Promise<Result<ServiceNowGroupRecord | null>> {
        try {
            const entity = await this.repo.findOne({ where: { group_name: groupName } });
            return Result.ok(entity ? this.toRecord(entity) : null);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async isKnownGroup(groupName: string): Promise<Result<boolean>> {
        try {
            const count = await this.repo.count({ where: { group_name: groupName, is_active: true } });
            return Result.ok(count > 0);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async save(groupId: string, groupName: string, description?: string): Promise<Result<void>> {
        try {
            const now = new Date();
            await this.repo.save({
                group_id: groupId,
                group_name: groupName,
                description: description ?? null,
                is_active: true,
                created_at: now,
                updated_at: now,
            });
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async update(groupId: string, data: { description?: string; isActive?: boolean }): Promise<Result<void>> {
        try {
            const updateData: Partial<ServiceNowGroupEntity> = { updated_at: new Date() };
            if (data.description !== undefined) updateData.description = data.description;
            if (data.isActive !== undefined) updateData.is_active = data.isActive;
            await this.repo.update({ group_id: groupId }, updateData);
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    async delete(groupId: string): Promise<Result<void>> {
        try {
            await this.repo.delete({ group_id: groupId });
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error as Error);
        }
    }

    private toRecord(entity: ServiceNowGroupEntity): ServiceNowGroupRecord {
        return {
            groupId: entity.group_id,
            groupName: entity.group_name,
            description: entity.description,
            isActive: entity.is_active,
            createdAt: entity.created_at,
            updatedAt: entity.updated_at,
        };
    }
}
