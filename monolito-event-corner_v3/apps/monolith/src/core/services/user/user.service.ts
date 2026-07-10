// core/services/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { IUserService, UpdateUserProfileCommand } from '../../ports/incoming/user/user-service.port';
import { IUserRepository } from '../../ports/outgoing/repositories/user-repository.port';
import { Result } from '@app/result';
import { User } from '../../domain/entities/user.entity';
import { UserId, CompanyId } from '../../domain/value-objects/ids';
import { Email } from '../../domain/value-objects/email.value';
import { TracingService } from '@app/observability';

@Injectable()
export class UserService implements IUserService {
    constructor(
        private readonly userRepo: IUserRepository,
        private readonly tracing: TracingService,
    ) { }

    async syncUser(providerData: any): Promise<Result<User>> {
        return this.tracing.run(
            'monolith.syncUser',
            { kind: 'server', attributes: { 'user.externalId': providerData.external_id } },
            () => this._syncUser(providerData),
        );
    }

    private async _syncUser(providerData: any): Promise<Result<User>> {
        const existingResult = await this.userRepo.findByExternalId(providerData.external_id);
        if (existingResult.isFailure) return Result.err(existingResult.unwrapError());
        const existing = existingResult.unwrap();

        if (existing) {
            existing.syncFromProvider(providerData);
            const updateResult = await this.userRepo.update(existing);
            if (updateResult.isFailure) return Result.err(updateResult.unwrapError());
            return Result.ok(existing);
        }

        let emailValue: Email | null = null;
        if (providerData.email) {
            const emailResult = Email.create(providerData.email);
            if (emailResult.isFailure) return Result.err(emailResult.unwrapError());
            emailValue = emailResult.unwrap();
        }

        const userId = crypto.randomUUID() as unknown as UserId;
        const userResult = User.create(
            userId,
            providerData.external_id,
            providerData.name,
            providerData.last_name,
            providerData.full_name,
            emailValue,
            null,           // companyId: se asigna manualmente por admin
            providerData.domain,
            providerData.principal_name,
        );
        if (userResult.isFailure) return userResult;

        const user = userResult.unwrap();
        const saveResult = await this.userRepo.save(user);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        return Result.ok(user);
    }

    async getUser(id: UserId): Promise<Result<User | null>> {
        return this.userRepo.findById(id);
    }

    async getUserByExternalId(externalId: string): Promise<Result<User | null>> {
        return this.userRepo.findByExternalId(externalId);
    }

    async listUsers(): Promise<Result<User[]>> {
        return this.userRepo.findAll();
    }

    async listAllUsers(): Promise<Result<User[]>> {
        return this.userRepo.findAllUsers();
    }

    async assignCompany(userId: string, companyId: string | null): Promise<Result<User>> {
        return this.tracing.run(
            'monolith.assignCompany',
            { kind: 'server', attributes: { 'user.userId': userId } },
            () => this._assignCompany(userId, companyId),
        );
    }

    private async _assignCompany(userId: string, companyId: string | null): Promise<Result<User>> {
        const result = await this.userRepo.findById(userId as unknown as UserId);
        if (result.isFailure) return Result.err(result.unwrapError());
        const user = result.unwrap();
        if (!user) return Result.err(new Error(`User ${userId} not found`));

        user.updateCompany(companyId ? CompanyId(companyId as any) : null);
        const updateResult = await this.userRepo.update(user);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());
        return Result.ok(user);
    }

    async getUserByEmail(email: string): Promise<Result<User | null>> {
        return this.userRepo.findByEmail(email);
    }

    async searchUsers(query: string, options: { requireCompany?: boolean; activeOnly?: boolean } = {}): Promise<Result<User[]>> {
        return this.userRepo.search(query, options);
    }

    async updateUserProfile(userId: string, command: UpdateUserProfileCommand): Promise<Result<User>> {
        return this.tracing.run(
            'monolith.updateUserProfile',
            { kind: 'server', attributes: { 'user.userId': userId } },
            () => this._updateUserProfile(userId, command),
        );
    }

    private async _updateUserProfile(userId: string, command: UpdateUserProfileCommand): Promise<Result<User>> {
        const result = await this.userRepo.findById(userId as unknown as UserId);
        if (result.isFailure) return Result.err(result.unwrapError());
        const user = result.unwrap();
        if (!user) return Result.err(new Error(`User ${userId} not found`));

        user.syncFromProvider({
            name: command.name ?? user.name,
            last_name: command.lastName ?? user.lastName,
            full_name: command.name !== undefined || command.lastName !== undefined
                ? `${command.name ?? user.name ?? ''} ${command.lastName ?? user.lastName ?? ''}`.trim()
                : user.fullName,
        });
        if (command.companyId !== undefined) {
            user.updateCompany(command.companyId ? CompanyId(command.companyId as any) : null);
        }

        const updateResult = await this.userRepo.update(user);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());
        return Result.ok(user);
    }

    async deactivateUser(userId: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.deactivateUser',
            { kind: 'server', attributes: { 'user.userId': userId } },
            () => this._deactivateUser(userId),
        );
    }

    private async _deactivateUser(userId: string): Promise<Result<void>> {
        const result = await this.userRepo.findById(userId as unknown as UserId);
        if (result.isFailure) return Result.err(result.unwrapError());
        const user = result.unwrap();
        if (!user) return Result.err(new Error(`User ${userId} not found`));
        user.deactivate();
        const updateResult = await this.userRepo.update(user);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());
        return Result.ok(undefined);
    }

    async activateUser(userId: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.activateUser',
            { kind: 'server', attributes: { 'user.userId': userId } },
            () => this._activateUser(userId),
        );
    }

    private async _activateUser(userId: string): Promise<Result<void>> {
        const result = await this.userRepo.findById(userId as unknown as UserId);
        if (result.isFailure) return Result.err(result.unwrapError());
        const user = result.unwrap();
        if (!user) return Result.err(new Error(`User ${userId} not found`));
        user.activate();
        const updateResult = await this.userRepo.update(user);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());
        return Result.ok(undefined);
    }

    async deleteUser(userId: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.deleteUser',
            { kind: 'server', attributes: { 'user.userId': userId } },
            () => this._deleteUser(userId),
        );
    }

    private async _deleteUser(userId: string): Promise<Result<void>> {
        return this.userRepo.delete(userId as unknown as UserId);
    }
}
