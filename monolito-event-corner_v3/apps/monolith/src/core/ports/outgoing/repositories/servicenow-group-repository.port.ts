import { Result } from '@app/result';

export interface ServiceNowGroupRecord {
    groupId: string;
    groupName: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IServiceNowGroupRepository {
    findAll(): Promise<Result<ServiceNowGroupRecord[]>>;
    findActive(): Promise<Result<ServiceNowGroupRecord[]>>;
    isKnownGroup(groupName: string): Promise<Result<boolean>>;
    findByName(groupName: string): Promise<Result<ServiceNowGroupRecord | null>>;
    save(groupId: string, groupName: string, description?: string): Promise<Result<void>>;
    update(groupId: string, data: { description?: string; isActive?: boolean }): Promise<Result<void>>;
    delete(groupId: string): Promise<Result<void>>;
}
