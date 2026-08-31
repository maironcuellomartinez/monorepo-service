import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';
import { UserRole } from '../../entities/user-role.entity';
import { UserApplication } from '../../entities/user-application.entity';
import { Role } from '../../entities/role.entity';
import { AuditService, } from './audit.service';
import { AbacService } from './abac.service';
import { LoggerService } from '../../observability';
import { AuditAction, EntityType } from '../../entities';

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserRole)
        private userRoleRepository: Repository<UserRole>,
        @InjectRepository(UserApplication)
        private userApplicationRepository: Repository<UserApplication>,
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
        private dataSource: DataSource,
        private auditService: AuditService,
        private logger: LoggerService,
        private abacService: AbacService,
    ) { }

    async createUser(createDto: {
        email: string;
        name: string;
        password: string;
        phone?: string;
        profile?: Record<string, any>;
        createdBy: string;
    }): Promise<User> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verificar si el usuario ya existe
            const existingUser = await this.userRepository.findOne({
                where: { email: createDto.email }
            });

            if (existingUser) {
                throw new ConflictException('Ya existe un usuario con este email');
            }

            // Hash de la contraseña
            const passwordHash = await bcrypt.hash(createDto.password, 12);

            const nameParts = createDto.name.trim().split(/\s+/);
            const firstName = nameParts[0] ?? createDto.name;
            const lastName = nameParts.slice(1).join(' ') || '-';

            const user = this.userRepository.create({
                email: createDto.email,
                username: createDto.name,
                firstName,
                lastName,
                passwordHash,
                phone: createDto.phone,
                profile: createDto.profile,
                createdBy: createDto.createdBy,
            });

            const savedUser = await queryRunner.manager.save(user);
            await queryRunner.commitTransaction();

            // Auditoría
            await this.auditService.logCrudEvent(AuditAction.CREATE, {
                entityType: EntityType.USER,
                entityId: savedUser.id,
                userId: createDto.createdBy,
                userEmail: 'system',
                changes: { ...createDto, password: '••••••••' },
            });

            this.logger.log('Usuario creado', 'USER', {
                userId: savedUser.id,
                email: savedUser.email,
            });

            return savedUser;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al crear usuario', (error as Error).stack, 'USER', {
                error: (error as Error).message,
                email: createDto.email,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async getUsers(filters: {
        isActive?: boolean;
        page?: number;
        limit?: number;
        searchTerm?: string;
        accountType?: string;
    } = {}): Promise<{ users: User[]; total: number }> {
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const skip = (page - 1) * limit;

        const query = this.userRepository.createQueryBuilder('user');

        if (filters.isActive !== undefined) {
            query.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
        }

        if (filters.searchTerm) {
            query.andWhere(
                '(user.email LIKE :searchTerm OR user.firstName LIKE :searchTerm OR user.lastName LIKE :searchTerm)',
                { searchTerm: `%${filters.searchTerm}%` }
            );
        }

        if (filters.accountType) {
            query.andWhere('user.accountType = :accountType', { accountType: filters.accountType });
        }

        const [users, total] = await query
            .orderBy('user.createdAt', 'DESC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        // Ocultar información sensible
        users.forEach(user => {
            user.passwordHash = '';
        });

        return { users, total };
    }

    async getUserById(userId: string): Promise<User> {
        const user = await this.userRepository.findOne({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        user.passwordHash = '';
        return user;
    }

    async updateUser(
        userId: string,
        updateDto: {
            firstName?: string;
            lastName?: string;
            username?: string;
            phone?: string;
            profile?: Record<string, any>;
            entraId?: string | null;
            updatedBy: string;
        }
    ): Promise<User> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const user = await queryRunner.manager.findOne(User, {
                where: { id: userId }
            });

            if (!user) {
                throw new NotFoundException('Usuario no encontrado');
            }

            // Guardar estado anterior para auditoría
            const previousState = { ...user };

            // Actualizar campos
            if (updateDto.firstName !== undefined) user.firstName = updateDto.firstName;
            if (updateDto.lastName !== undefined) user.lastName = updateDto.lastName;
            if (updateDto.username !== undefined) user.username = updateDto.username;
            if (updateDto.phone !== undefined) user.phone = updateDto.phone;
            if (updateDto.profile !== undefined) user.profile = updateDto.profile;
            if ('entraId' in updateDto) user.entraId = updateDto.entraId ?? null;
            user.updatedBy = updateDto.updatedBy;

            const updatedUser = await queryRunner.manager.save(user);
            await queryRunner.commitTransaction();

            // Auditoría
            const changes = this.getChanges(previousState, updatedUser);
            await this.auditService.logCrudEvent(AuditAction.UPDATE, {
                entityType: EntityType.USER,
                entityId: userId,
                userId: updateDto.updatedBy,
                userEmail: 'system',
                changes,
            });

            updatedUser.passwordHash = ''; // Asignar una cadena vacía en lugar de undefined
            return updatedUser;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al actualizar usuario', (error as Error).stack, 'USER', {
                userId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async deactivateUser(userId: string, deletedBy: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const user = await queryRunner.manager.findOne(User, {
                where: { id: userId }
            });

            if (!user) {
                throw new NotFoundException('Usuario no encontrado');
            }

            await queryRunner.manager.update(
                User,
                { id: userId },
                {
                    isActive: false,
                    updatedBy: deletedBy
                }
            );

            await queryRunner.commitTransaction();
            await this.abacService.invalidateAllUserCache(userId);

            // Auditoría
            await this.auditService.logCrudEvent(AuditAction.DEACTIVATE, {
                entityType: EntityType.USER,
                entityId: userId,
                userId: deletedBy,
                userEmail: 'system',
                changes: { userId },
            });

            this.logger.log('Usuario desactivado', 'USER', { userId, deletedBy });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al desactivar usuario', (error as Error).stack, 'USER', {
                userId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async reactivateUser(userId: string, updatedBy: string): Promise<void> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');
        await this.userRepository.update({ id: userId }, { isActive: true, updatedBy });
        await this.abacService.invalidateAllUserCache(userId);
        await this.auditService.logCrudEvent(AuditAction.UPDATE, {
            entityType: EntityType.USER,
            entityId: userId,
            userId: updatedBy,
            userEmail: 'system',
            changes: { action: 'reactivate' },
        });
        this.logger.log('Usuario reactivado', 'USER', { userId, updatedBy });
    }

    async hardDeleteUser(userId: string): Promise<void> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');
        if (user.isActive) throw new ConflictException('Desactiva el usuario antes de eliminarlo permanentemente');

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await qr.manager.delete(UserRole, { userId });
            await qr.manager.delete(UserApplication, { userId });
            await qr.manager.delete(User, { id: userId });
            await qr.commitTransaction();
            await this.abacService.invalidateAllUserCache(userId);
            this.logger.log('Usuario eliminado permanentemente', 'USER', { userId });
        } catch (err) {
            await qr.rollbackTransaction();
            throw err;
        } finally {
            await qr.release();
        }
    }

    private getChanges(previous: any, current: any): Record<string, any> {
        const changes: Record<string, any> = {};
        Object.keys(current).forEach(key => {
            if (previous[key] !== current[key] && key !== 'updatedAt' && key !== 'updatedBy') {
                changes[key] = {
                    from: previous[key],
                    to: current[key]
                };
            }
        });
        return changes;
    }

    // ── Role assignment ────────────────────────────────────────────────────────

    async getUserRoles(userId: string): Promise<UserRole[]> {
        return this.userRoleRepository.find({
            where: { userId, isActive: true },
            relations: ['role'],
        });
    }

    async assignRole(
        userId: string,
        roleId: string,
        applicationId: string,
        assignedBy: string,
    ): Promise<UserRole> {
        // Verificar que el usuario existe
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        // Verificar que el rol existe
        const role = await this.roleRepository.findOne({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Rol no encontrado');

        // Verificar si ya existe (activo o inactivo)
        const existing = await this.userRoleRepository.findOne({
            where: { userId, roleId, applicationId },
        });

        if (existing) {
            if (existing.isActive) {
                throw new ConflictException('El usuario ya tiene este rol asignado');
            }
            // Reactivar
            existing.isActive = true;
            const saved = await this.userRoleRepository.save(existing);
            await this.abacService.invalidateUserCache(userId, applicationId);
            this.logger.log(`Rol reactivado: user=${userId} role=${role.name}`, 'USER');
            return saved;
        }

        const userRole = this.userRoleRepository.create({
            userId,
            roleId,
            applicationId,
            isActive: true,
            createdBy: assignedBy,
        });

        const saved = await this.userRoleRepository.save(userRole);
        await this.abacService.invalidateUserCache(userId, applicationId);

        this.logger.log(`Rol asignado: user=${userId} role=${role.name}`, 'USER');

        await this.auditService.logCrudEvent(AuditAction.CREATE, {
            entityType: EntityType.USER,
            entityId: userId,
            userId: assignedBy,
            userEmail: 'system',
            changes: { action: 'assign_role', roleId, roleName: role.name },
        });

        return saved;
    }

    async removeRole(userId: string, roleId: string, removedBy: string): Promise<void> {
        const userRole = await this.userRoleRepository.findOne({
            where: { userId, roleId, isActive: true },
        });

        if (!userRole) throw new NotFoundException('Asignación de rol no encontrada');

        userRole.isActive = false;
        await this.userRoleRepository.save(userRole);
        await this.abacService.invalidateUserCache(userId, userRole.applicationId);

        this.logger.log(`Rol removido: user=${userId} role=${roleId}`, 'USER');
    }

    // ── Application assignment ─────────────────────────────────────────────────

    async getUserApplications(userId: string): Promise<UserApplication[]> {
        return this.userApplicationRepository.find({
            where: { userId, isActive: true },
            relations: ['application'],
        });
    }

    async assignApplication(
        userId: string,
        applicationId: string,
        membershipType: string,
        assignedBy: string,
    ): Promise<UserApplication> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        const existing = await this.userApplicationRepository.findOne({
            where: { userId, applicationId },
        });

        if (existing) {
            if (existing.isActive) {
                throw new ConflictException('El usuario ya está vinculado a esta aplicación');
            }
            existing.isActive = true;
            existing.membershipType = membershipType;
            const saved = await this.userApplicationRepository.save(existing);
            await this.abacService.invalidateUserCache(userId, applicationId);
            return saved;
        }

        const ua = this.userApplicationRepository.create({
            userId,
            applicationId,
            membershipType,
            isActive: true,
            createdBy: assignedBy,
        });

        const saved = await this.userApplicationRepository.save(ua);
        await this.abacService.invalidateUserCache(userId, applicationId);
        this.logger.log(`App asignada: user=${userId} app=${applicationId}`, 'USER');
        return saved;
    }

    async removeApplication(
        userId: string,
        applicationId: string,
        removedBy: string,
    ): Promise<void> {
        const ua = await this.userApplicationRepository.findOne({
            where: { userId, applicationId, isActive: true },
        });

        if (!ua) throw new NotFoundException('Vinculación no encontrada');

        ua.isActive = false;
        await this.userApplicationRepository.save(ua);
        await this.abacService.invalidateUserCache(userId, applicationId);

        this.logger.log(`App desvinculada: user=${userId} app=${applicationId}`, 'USER');
    }
}