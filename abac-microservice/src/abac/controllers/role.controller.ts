import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, NotFoundException, ConflictException, BadRequestException, Request, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Role } from '../../entities/role.entity';
import { RolePermission } from '../../entities/role-permission.entity';
import { Permission } from '../../entities/permission.entity';
import { UserRole } from '../../entities/user-role.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators';
import { AuditService } from '../services/audit.service';
import { AuditAction, EntityType } from '../../entities';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RoleController {
    private readonly logger = new Logger(RoleController.name);

    constructor(
        @InjectRepository(Role) private roleRepository: Repository<Role>,
        @InjectRepository(RolePermission) private rolePermRepository: Repository<RolePermission>,
        @InjectRepository(Permission) private permissionRepository: Repository<Permission>,
        @InjectRepository(UserRole) private userRoleRepository: Repository<UserRole>,
        private dataSource: DataSource,
        private auditService: AuditService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Listar roles' })
    @ApiQuery({ name: 'applicationId', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @Roles('admin')
    async findAll(
        @Query('applicationId') applicationId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const where: any = {};
        if (applicationId) where.applicationId = applicationId;

        const take = Math.min(Math.max(parseInt(limit ?? '200') || 200, 1), 500);
        const skip = (Math.max(parseInt(page ?? '1') || 1, 1) - 1) * take;

        const [roles, total] = await this.roleRepository.findAndCount({
            where,
            order: { weight: 'DESC' },
            take,
            skip,
        });

        return { roles, total, page: skip / take + 1, limit: take };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener rol con permisos' })
    @Roles('admin')
    async findOne(@Param('id') id: string) {
        const role = await this.roleRepository.findOne({
            where: { id },
            relations: ['permissions', 'permissions.permission'],
        });
        if (!role) throw new NotFoundException(`Rol ${id} no encontrado`);
        // Excluir permisos desactivados — isActive:false significa "removido" por el dashboard
        role.permissions = role.permissions.filter(rp => rp.isActive !== false);
        return role;
    }

    @Post()
    @ApiOperation({ summary: 'Crear rol' })
    @Roles('admin')
    async create(@Request() req: any, @Body() body: { name: string; description?: string; applicationId: string; type?: 'system' | 'custom'; weight?: number }) {
        const existing = await this.roleRepository.findOne({
            where: { name: body.name, applicationId: body.applicationId },
        });
        if (existing) {
            throw new ConflictException(`Ya existe un rol "${body.name}" en esta aplicación`);
        }

        const role = this.roleRepository.create({
            name: body.name,
            description: body.description || '',
            applicationId: body.applicationId,
            type: body.type || 'custom',
            weight: body.weight ?? 0,
        });

        const saved = await this.roleRepository.save(role);

        this.auditService.logCrudEvent(AuditAction.CREATE, {
            entityType: EntityType.ROLE,
            entityId: saved.id,
            userId: req.user?.id,
            userEmail: req.user?.email,
            applicationId: body.applicationId,
            changes: { name: body.name, applicationId: body.applicationId, type: body.type },
        }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`); });

        return saved;
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar rol' })
    @Roles('admin')
    async update(@Request() req: any, @Param('id') id: string, @Body() body: { name?: string; description?: string; weight?: number }) {
        const role = await this.roleRepository.findOne({ where: { id } });
        if (!role) throw new NotFoundException('Rol no encontrado');

        if (body.name !== undefined) role.name = body.name;
        if (body.description !== undefined) role.description = body.description;
        if (body.weight !== undefined) role.weight = body.weight;

        const saved = await this.roleRepository.save(role);

        this.auditService.logCrudEvent(AuditAction.UPDATE, {
            entityType: EntityType.ROLE,
            entityId: id,
            userId: req.user?.id,
            userEmail: req.user?.email,
            applicationId: role.applicationId,
            changes: body,
        }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`); });

        return saved;
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Desactivar rol (soft delete)' })
    @Roles('admin')
    async deactivate(@Request() req: any, @Param('id') id: string) {
        const role = await this.roleRepository.findOne({ where: { id } });
        if (!role) throw new NotFoundException('Rol no encontrado');

        role.isActive = false;
        await this.roleRepository.save(role);

        this.auditService.logCrudEvent(AuditAction.DEACTIVATE, {
            entityType: EntityType.ROLE,
            entityId: id,
            userId: req.user?.id,
            userEmail: req.user?.email,
            applicationId: role.applicationId,
        }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`); });

        return { message: 'Rol desactivado' };
    }

    @Post(':id/reactivate')
    @ApiOperation({ summary: 'Reactivar rol' })
    @Roles('admin')
    async reactivate(@Request() req: any, @Param('id') id: string) {
        const role = await this.roleRepository.findOne({ where: { id } });
        if (!role) throw new NotFoundException('Rol no encontrado');

        role.isActive = true;
        await this.roleRepository.save(role);

        this.auditService.logCrudEvent(AuditAction.REACTIVATE, {
            entityType: EntityType.ROLE,
            entityId: id,
            userId: req.user?.id,
            userEmail: req.user?.email,
            applicationId: role.applicationId,
        }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`); });

        return { message: 'Rol reactivado' };
    }

    @Delete(':id/permanent')
    @ApiOperation({ summary: 'Eliminar rol permanentemente (requiere isActive=false)' })
    @Roles('admin')
    async hardDelete(@Request() req: any, @Param('id') id: string) {
        const role = await this.roleRepository.findOne({ where: { id } });
        if (!role) throw new NotFoundException('Rol no encontrado');
        if (role.isActive) throw new BadRequestException('Desactiva el rol antes de eliminarlo permanentemente');

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await qr.manager.delete(UserRole, { roleId: id });
            await qr.manager.delete(RolePermission, { roleId: id });
            await qr.manager.delete(Role, { id });
            await qr.commitTransaction();

            this.auditService.logCrudEvent(AuditAction.DELETE, {
                entityType: EntityType.ROLE,
                entityId: id,
                userId: req.user?.id,
                userEmail: req.user?.email,
                applicationId: role.applicationId,
            }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`); });

            return { message: 'Rol eliminado permanentemente' };
        } catch (err) {
            await qr.rollbackTransaction();
            throw err;
        } finally {
            await qr.release();
        }
    }

    // ── Role Permissions ──────────────────────────────────────────

    @Get(':id/permissions')
    @ApiOperation({ summary: 'Listar permisos del rol' })
    @Roles('admin')
    async getPermissions(@Param('id') id: string) {
        return this.rolePermRepository.find({
            where: { roleId: id, isActive: true },
            relations: ['permission'],
        });
    }

    @Post(':id/permissions')
    @ApiOperation({ summary: 'Asignar permiso a rol' })
    @Roles('admin')
    async addPermission(@Param('id') id: string, @Body() body: { permissionId: string; effect?: 'allow' | 'deny' }) {
        const role = await this.roleRepository.findOne({ where: { id } });
        if (!role) throw new NotFoundException('Rol no encontrado');

        const permission = await this.permissionRepository.findOne({ where: { id: body.permissionId } });
        if (!permission) throw new NotFoundException('Permiso no encontrado');

        const existing = await this.rolePermRepository.findOne({
            where: { roleId: id, permissionId: body.permissionId },
        });

        if (existing) {
            if (existing.isActive) {
                throw new ConflictException('El permiso ya está asignado a este rol');
            }
            existing.isActive = true;
            existing.effect = body.effect || 'allow';
            return this.rolePermRepository.save(existing);
        }

        const rp = this.rolePermRepository.create({
            roleId: id,
            permissionId: body.permissionId,
            effect: body.effect || 'allow',
        });

        return this.rolePermRepository.save(rp);
    }

    @Delete(':id/permissions/:permissionId')
    @ApiOperation({ summary: 'Remover permiso del rol' })
    @Roles('admin')
    async removePermission(@Param('id') id: string, @Param('permissionId') permissionId: string) {
        const rp = await this.rolePermRepository.findOne({
            where: { roleId: id, permissionId, isActive: true },
        });
        if (!rp) throw new NotFoundException('Asignación no encontrada');

        rp.isActive = false;
        await this.rolePermRepository.save(rp);
        return { message: 'Permiso removido del rol' };
    }
}
