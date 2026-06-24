import { Result } from '@app/result';
import { User } from '../../../domain/entities/user.entity';

export interface UpdateUserProfileCommand {
    name?: string;
    lastName?: string;
    companyId?: string | null;
}

export interface IUserService {
    syncUser(providerData: any): Promise<Result<User>>;
    listUsers(): Promise<Result<User[]>>;
    listAllUsers(): Promise<Result<User[]>>;
    getUser(id: string): Promise<Result<User | null>>;
    getUserByExternalId(externalId: string): Promise<Result<User | null>>;
    getUserByEmail(email: string): Promise<Result<User | null>>;
    assignCompany(userId: string, companyId: string | null): Promise<Result<User>>;
    updateUserProfile(userId: string, command: UpdateUserProfileCommand): Promise<Result<User>>;
    deactivateUser(userId: string): Promise<Result<void>>;
    activateUser(userId: string): Promise<Result<void>>;
    deleteUser(userId: string): Promise<Result<void>>;
}
