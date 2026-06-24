import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Permission } from '../../entities/permission.entity';
import { AuditService, AuditAction, EntityType } from './audit.service';
import { LoggerService } from '../../observability';
import { CreatePermissionDto } from '../dtos/create-permission.dto';

@Injectable()
export class PermissionService {
    constructor(
        @InjectRepository(Permission)
        private permissionRepository: Repository<Permission>,
        private dataSource: DataSource,
        private auditService: AuditService,
        private logger: LoggerService,
    ) { }

    async createPermission(createDto: CreatePermissionDto): Promise<Permission> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verificar si el permiso ya existe
            const existingPermission = await this.permissionRepository.findOne({
                where: {
                    resource: createDto.resource,
                    action: createDto.action,
                },
            });

            if (existingPermission) {
                throw new ConflictException('Ya existe un permiso con este recurso y acción');
            }

            const permission = this.permissionRepository.create({
                resource: createDto.resource,
                action: createDto.action,
                description: createDto.description,
                category: createDto.category || 'system',
                weight: createDto.weight || 0,
                createdBy: createDto.createdBy,
            });

            const savedPermission = await queryRunner.manager.save(permission);
            await queryRunner.commitTransaction();

            // Auditoría
            await this.auditService.logCrudEvent(AuditAction.CREATE, {
                entityType: EntityType.PERMISSION,
                entityId: savedPermission.id,
                userId: createDto.createdBy || 'system',
                userEmail: 'system',
                changes: createDto,
            });

            this.logger.log('Permiso creado', 'PERMISSION', {
                permissionId: savedPermission.id,
                permission: savedPermission.getPermissionString(),
            });

            return savedPermission;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al crear permiso', (error as Error).stack, 'PERMISSION', {
                error: (error as Error).message,
                dto: createDto
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async getPermissions(filters: {
        resource?: string;
        action?: string;
        category?: string;
        isActive?: boolean;
        page?: number;
        limit?: number;
        searchTerm?: string;
        applicationId?: string;
    } = {}): Promise<{ permissions: Permission[]; total: number }> {
        const page = filters.page || 1;
        const limit = filters.limit || 50;
        const skip = (page - 1) * limit;

        const query = this.permissionRepository.createQueryBuilder('permission');

        // Filtrar por aplicación: solo permisos asignados a al menos un rol de esa app
        if (filters.applicationId) {
            query
                .innerJoin('role_permissions', 'rp', 'rp.permissionId = permission.id')
                .innerJoin('roles', 'r', 'r.id = rp.roleId AND r.applicationId = :applicationId', {
                    applicationId: filters.applicationId,
                });
        }

        if (filters.resource) {
            query.andWhere('permission.resource = :resource', { resource: filters.resource });
        }

        if (filters.action) {
            query.andWhere('permission.action = :action', { action: filters.action });
        }

        if (filters.category) {
            query.andWhere('permission.category = :category', { category: filters.category });
        }

        if (filters.isActive !== undefined) {
            query.andWhere('permission.isActive = :isActive', { isActive: filters.isActive });
        }

        if (filters.searchTerm) {
            query.andWhere(
                '(permission.resource LIKE :searchTerm OR permission.action LIKE :searchTerm OR permission.description LIKE :searchTerm)',
                { searchTerm: `%${filters.searchTerm}%` }
            );
        }

        const [permissions, total] = await query
            .distinct(true)
            .orderBy('permission.category', 'ASC')
            .addOrderBy('permission.weight', 'DESC')
            .addOrderBy('permission.resource', 'ASC')
            .addOrderBy('permission.action', 'ASC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return { permissions, total };
    }

    async searchPermissions(searchTerm: string, applicationId?: string): Promise<Permission[]> {
        const query = this.permissionRepository
            .createQueryBuilder('permission')
            .where('permission.isActive = true')
            .andWhere(
                '(permission.resource LIKE :searchTerm OR permission.action LIKE :searchTerm OR permission.description LIKE :searchTerm)',
                { searchTerm: `%${searchTerm}%` }
            );

        if (applicationId) {
            query.innerJoin('permission.policies', 'policy', 'policy.applicationId = :applicationId', { applicationId });
        }

        return query
            .orderBy('permission.resource', 'ASC')
            .addOrderBy('permission.action', 'ASC')
            .getMany();
    }

    async deactivatePermission(permissionId: string, deletedBy: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const permission = await queryRunner.manager.findOne(Permission, {
                where: { id: permissionId },
            });

            if (!permission) {
                throw new NotFoundException('Permiso no encontrado');
            }

            await queryRunner.manager.update(
                Permission,
                { id: permissionId },
                {
                    isActive: false,
                    updatedBy: deletedBy
                }
            );

            await queryRunner.commitTransaction();

            // Auditoría
            await this.auditService.logCrudEvent(AuditAction.DEACTIVATE, {
                entityType: EntityType.PERMISSION,
                entityId: permissionId,
                userId: deletedBy,
                userEmail: 'system',
                changes: { permissionId },
            });

            this.logger.log('Permiso desactivado', 'PERMISSION', {
                permissionId,
                deletedBy,
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al desactivar permiso', (error as Error).stack, 'PERMISSION', {
                permissionId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async reactivatePermission(permissionId: string, updatedBy: string): Promise<void> {
        const permission = await this.permissionRepository.findOne({ where: { id: permissionId } });
        if (!permission) throw new NotFoundException('Permiso no encontrado');
        await this.permissionRepository.update({ id: permissionId }, { isActive: true, updatedBy });
        this.logger.log('Permiso reactivado', 'PERMISSION', { permissionId, updatedBy });
    }

    async hardDeletePermission(permissionId: string): Promise<void> {
        const permission = await this.permissionRepository.findOne({ where: { id: permissionId } });
        if (!permission) throw new NotFoundException('Permiso no encontrado');
        if (permission.isActive) throw new ConflictException('Desactiva el permiso antes de eliminarlo permanentemente');

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await qr.query('DELETE FROM role_permissions WHERE permissionId = ?', [permissionId]);
            await qr.query('DELETE FROM policy_permissions WHERE permissionId = ?', [permissionId]);
            await qr.query('DELETE FROM permissions WHERE id = ?', [permissionId]);
            await qr.commitTransaction();
            this.logger.log('Permiso eliminado permanentemente', 'PERMISSION', { permissionId });
        } catch (err) {
            await qr.rollbackTransaction();
            throw err;
        } finally {
            await qr.release();
        }
    }

    async getPermissionById(id: string): Promise<Permission> {
        const permission = await this.permissionRepository.findOne({ where: { id } });
        if (!permission) throw new NotFoundException('Permiso no encontrado');
        return permission;
    }

    async updatePermission(
        id: string,
        dto: { description?: string; category?: string; weight?: number; updatedBy?: string },
    ): Promise<Permission> {
        const permission = await this.permissionRepository.findOne({ where: { id } });
        if (!permission) throw new NotFoundException('Permiso no encontrado');

        if (dto.description !== undefined) permission.description = dto.description;
        if (dto.category !== undefined) permission.category = dto.category;
        if (dto.weight !== undefined) permission.weight = dto.weight;
        if (dto.updatedBy !== undefined) permission.updatedBy = dto.updatedBy;

        const saved = await this.permissionRepository.save(permission);

        this.logger.log('Permiso actualizado', 'PERMISSION', { permissionId: id });

        return saved;
    }

    async getPermissionByResourceAction(resource: string, action: string): Promise<Permission> {
        const permission = await this.permissionRepository.findOne({
            where: { resource, action, isActive: true },
        });

        if (!permission) {
            throw new NotFoundException('Permiso no encontrado');
        }

        return permission;
    }

    async bulkCreatePermissions(
        permissions: Array<{
            resource: string;
            action: string;
            description?: string;
            category?: string;
            weight?: number;
        }>,
        createdBy: string
    ): Promise<Permission[]> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const createdPermissions: Permission[] = [];

            for (const perm of permissions) {
                // Verificar si ya existe
                const existing = await this.permissionRepository.findOne({
                    where: { resource: perm.resource, action: perm.action },
                });

                if (!existing) {
                    const permission = this.permissionRepository.create({
                        ...perm,
                        createdBy,
                    });

                    const savedPermission = await queryRunner.manager.save(permission);
                    createdPermissions.push(savedPermission);
                }
            }

            await queryRunner.commitTransaction();

            // Auditoría
            if (createdPermissions.length > 0) {
                await this.auditService.logCrudEvent(AuditAction.CREATE, {
                    entityType: EntityType.PERMISSION,
                    entityId: 'bulk',
                    userId: createdBy,
                    userEmail: 'system',
                    changes: { count: createdPermissions.length, permissions: createdPermissions.map(p => p.getPermissionString()) },
                });
            }

            this.logger.log('Permisos creados en bulk', 'PERMISSION', {
                count: createdPermissions.length,
                createdBy,
            });

            return createdPermissions;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al crear permisos en bulk', (error as Error).stack, 'PERMISSION', {
                error: (error as Error).message,
                count: permissions.length,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async findAllPermissions(): Promise<Permission[]> {
        return this.permissionRepository.find();
    }
}