import { Result } from '@app/result';
import { USER_REPOSITORY } from './tokens';
import { User } from '@app/core/domain/entities/user.entity';
import { CompanyId, UserId } from '@app/shared/types/branded-ids';

export interface IUserRepository {
    save(user: User): Promise<Result<void>>;
    findAll(): Promise<Result<User[]>>;
    findAllUsers(): Promise<Result<User[]>>;
    findById(id: UserId): Promise<Result<User | null>>;
    findByExternalId(externalId: string): Promise<Result<User | null>>;
    findByEmail(email: string): Promise<Result<User | null>>;
    search(query: string, options?: { limit?: number; requireCompany?: boolean; activeOnly?: boolean }): Promise<Result<User[]>>;
    findByCompany(companyId: CompanyId): Promise<Result<User[]>>;
    update(user: User): Promise<Result<void>>;
    delete(id: UserId): Promise<Result<void>>;
    updateDeviceToken(userId: UserId, token: string): Promise<Result<void>>;
    removeDeviceToken(userId: UserId, token: string): Promise<Result<void>>;
}

export { USER_REPOSITORY };