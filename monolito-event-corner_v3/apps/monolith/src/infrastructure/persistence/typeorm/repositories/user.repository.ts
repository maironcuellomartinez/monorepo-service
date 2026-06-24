// infrastructure/persistence/typeorm/repositories/user.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { IUserRepository } from '../../../../core/ports/outgoing/repositories/user-repository.port';
import { UserEntity } from '../entities/user.entity';
import { UserId, CompanyId } from '../../../../core/domain/value-objects/ids';
import { Email } from '../../../../core/domain/value-objects/email.value';
import { Result } from '@app/result';
import { User } from '@app/core/domain/entities/user.entity';

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
    constructor(
        @InjectRepository(UserEntity)
        private readonly repo: Repository<UserEntity>,
    ) { }

    async save(user: User): Promise<Result<void>> {
        try {
            const entity = this.toEntity(user);
            await this.repo.save(entity);
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findById(id: UserId | string): Promise<Result<User | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { customer_id: id.toString() },
                relations: ['company'],
            });
            if (!entity) return Result.ok(null);
            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByExternalId(externalId: string): Promise<Result<User | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { external_id: externalId },
                relations: ['company'],
            });
            if (!entity) return Result.ok(null);
            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByEmail(email: string): Promise<Result<User | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { email },
                relations: ['company'],
            });
            if (!entity) return Result.ok(null);
            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findAll(): Promise<Result<User[]>> {
        try {
            const entities = await this.repo.find({
                where: { is_active: true, company_id: Not(IsNull()) },
                order: { full_name: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findAllUsers(): Promise<Result<User[]>> {
        try {
            const entities = await this.repo.find({
                order: { full_name: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCompany(companyId: string | CompanyId): Promise<Result<User[]>> {
        try {
            const entities = await this.repo.find({
                where: { company_id: companyId.toString(), is_active: true },
                relations: ['company'],
                order: { full_name: 'ASC' },
            });
            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async update(user: User): Promise<Result<void>> {
        return this.save(user);
    }

    async delete(id: UserId | string): Promise<Result<void>> {
        try {
            await this.repo.update(
                { customer_id: id.toString() },
                { is_active: false, updated_at: new Date() }
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async updateDeviceToken(userId: string, token: string): Promise<Result<void>> {
        try {
            const user = await this.repo.findOne({ where: { customer_id: userId } });
            if (!user) {
                return Result.err(new Error(`User ${userId} not found`));
            }

            let tokens: string[] = [];
            if (user.device_tokens) {
                try {
                    tokens = JSON.parse(user.device_tokens);
                } catch {
                    tokens = [];
                }
            }

            if (!tokens.includes(token)) {
                tokens.push(token);
                user.device_tokens = JSON.stringify(tokens);
                user.updated_at = new Date();
                await this.repo.save(user);
            }

            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async removeDeviceToken(userId: string, token: string): Promise<Result<void>> {
        try {
            const user = await this.repo.findOne({ where: { customer_id: userId } });
            if (!user) {
                return Result.err(new Error(`User ${userId} not found`));
            }

            if (user.device_tokens) {
                try {
                    let tokens = JSON.parse(user.device_tokens);
                    tokens = tokens.filter(t => t !== token);
                    user.device_tokens = tokens.length > 0 ? JSON.stringify(tokens) : null;
                    user.updated_at = new Date();
                    await this.repo.save(user);
                } catch {
                    // Ignorar error de parseo
                }
            }

            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    private toEntity(domain: User): UserEntity {
        const entity = new UserEntity();
        entity.customer_id = domain.id.toString();
        entity.external_id = domain.externalId;
        entity.name = domain.name;
        entity.last_name = domain.lastName;
        entity.full_name = domain.fullName;
        entity.email = domain.email?.value || null;
        entity.company_id = domain.companyId?.toString() || null;
        entity.domain = domain.domain;
        entity.principal_name = domain.principalName;
        entity.device_tokens = domain.deviceTokens ? JSON.stringify(domain.deviceTokens) : null;
        entity.is_active = domain.isActive;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;
        return entity;
    }

    private toDomain(entity: UserEntity): User {
        const email = entity.email ? Email.create(entity.email).toNullable() : null;

        let deviceTokens: string[] = [];
        if (entity.device_tokens) {
            try {
                deviceTokens = JSON.parse(entity.device_tokens);
            } catch {
                deviceTokens = [];
            }
        }

        return User.reconstitute(
            UserId(entity.customer_id as any),
            entity.external_id,
            entity.name,
            entity.last_name,
            entity.full_name,
            email,
            entity.company_id ? CompanyId(entity.company_id as any) : null,
            entity.domain,
            entity.principal_name,
            deviceTokens,
            entity.is_active,
            entity.created_at,
            entity.updated_at,
        );
    }
}