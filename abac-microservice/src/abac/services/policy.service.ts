import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull, Brackets, DataSource } from 'typeorm';
import { Policy } from '../../entities/policy.entity';
import { PolicyRule } from '../../entities/policy-rule.entity';
import { PolicyPermission } from '../../entities/policy-permission.entity';
import { Permission } from '../../entities/permission.entity';
import { Application } from '../../entities/application.entity';
import { RuleValidator } from '../utils/rule-validator.util';
import { LoggerService } from '../../observability';
import { AuditService } from './audit.service';
import { AuditAction, EntityType } from '../../entities';
import { CreatePolicyDto, CreatePolicyRuleDto, PolicyFilters, UpdatePolicyDto } from '../dtos/policy-request.dto';

@Injectable()
export class PolicyService {
    constructor(
        @InjectRepository(Policy)
        private policyRepository: Repository<Policy>,
        @InjectRepository(PolicyRule)
        private policyRuleRepository: Repository<PolicyRule>,
        @InjectRepository(PolicyPermission)
        private policyPermissionRepository: Repository<PolicyPermission>,
        @InjectRepository(Permission)
        private permissionRepository: Repository<Permission>,
        @InjectRepository(Application)
        private applicationRepository: Repository<Application>,
        private dataSource: DataSource,
        private auditService: AuditService,
        private logger: LoggerService,
    ) { }

    /**
     * Crea una nueva política
     */
    async createPolicy(createPolicyDto: CreatePolicyDto): Promise<Policy> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verificar si la aplicación existe
            const application = await queryRunner.manager.findOne(Application, {
                where: { id: createPolicyDto.applicationId, isActive: true },
            });

            if (!application) {
                throw new NotFoundException('Aplicación no encontrada');
            }

            // Verificar si la política ya existe
            const existingPolicy = await queryRunner.manager.findOne(Policy, {
                where: {
                    name: createPolicyDto.name,
                    applicationId: createPolicyDto.applicationId,
                },
            });

            if (existingPolicy) {
                throw new ConflictException('Ya existe una política con este nombre en la aplicación');
            }

            // Validar condiciones si se proveen
            if (createPolicyDto.conditions && Object.keys(createPolicyDto.conditions).length > 0) {
                if (!RuleValidator.isValidCondition(createPolicyDto.conditions)) {
                    throw new BadRequestException('Las condiciones de la política tienen un formato inválido');
                }
            }

            // Crear la política
            const policy = this.policyRepository.create({
                name: createPolicyDto.name,
                description: createPolicyDto.description,
                applicationId: createPolicyDto.applicationId,
                type: createPolicyDto.type || 'custom',
                priority: createPolicyDto.priority || 0,
                effect: createPolicyDto.effect || 'allow',
                conditions: createPolicyDto.conditions || {},
                createdBy: createPolicyDto.createdBy,
            });

            const savedPolicy = await queryRunner.manager.save(policy);
            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.CREATE, {
                entityType: EntityType.POLICY,
                entityId: savedPolicy.id,
                userId: createPolicyDto.createdBy ?? 'system',
                userEmail: 'system',
                applicationId: createPolicyDto.applicationId,
                applicationName: application.name,
                changes: createPolicyDto,
            });

            this.logger.log('Política creada exitosamente', 'POLICY', {
                policyId: savedPolicy.id,
                policyName: savedPolicy.name,
                createdBy: createPolicyDto.createdBy,
            });

            return savedPolicy;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al crear política', (error as Error).stack, 'POLICY', {
                error: (error as Error).message,
                dto: createPolicyDto
            });

            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Obtiene políticas con filtros
     */
    async getPolicies(
        applicationId: string | undefined,
        filters: PolicyFilters = {}
    ): Promise<{ policies: Policy[]; total: number }> {
        const page = filters?.page || 1;
        const limit = filters?.limit || 20;
        const skip = (page - 1) * limit;

        const query = this.policyRepository
            .createQueryBuilder('policy')
            .leftJoinAndSelect('policy.rules', 'rule')
            .leftJoinAndSelect('policy.permissions', 'policyPermission')
            .leftJoinAndSelect('policyPermission.permission', 'permission');

        if (applicationId) {
            query.where('policy.applicationId = :applicationId', { applicationId });
        }

        if (filters.type) {
            query.andWhere('policy.type = :type', { type: filters.type });
        }

        if (filters.effect) {
            query.andWhere('policy.effect = :effect', { effect: filters.effect });
        }

        if (filters.isActive !== undefined) {
            query.andWhere('policy.isActive = :isActive', { isActive: filters.isActive });
        }

        if (filters.searchTerm) {
            query.andWhere(
                new Brackets(qb => {
                    qb.where('policy.name LIKE :searchTerm', { searchTerm: `%${filters.searchTerm}%` })
                        .orWhere('policy.description LIKE :searchTerm', { searchTerm: `%${filters.searchTerm}%` });
                })
            );
        }

        const [policies, total] = await query
            .orderBy('policy.priority', 'DESC')
            .addOrderBy('policy.createdAt', 'DESC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return { policies, total };
    }

    /**
     * Obtiene una política por ID
     */
    async getPolicyById(policyId: string): Promise<Policy> {
        const policy = await this.policyRepository.findOne({
            where: { id: policyId },
            relations: ['rules', 'permissions', 'permissions.permission', 'application'],
        });

        if (!policy) {
            throw new NotFoundException('Política no encontrada');
        }

        return policy;
    }

    /**
     * Actualiza una política
     */
    async updatePolicy(policyId: string, updatePolicyDto: UpdatePolicyDto): Promise<Policy> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const policy = await queryRunner.manager.findOne(Policy, {
                where: { id: policyId },
                relations: ['application'],
            });

            if (!policy) {
                throw new NotFoundException('Política no encontrada');
            }

            // No permitir cambiar el tipo de políticas del sistema
            if (policy.type === 'system' && updatePolicyDto.type && updatePolicyDto.type !== 'system') {
                throw new ForbiddenException('No se puede cambiar el tipo de una política del sistema');
            }

            // Guardar cambios anteriores para auditoría
            const previousState = { ...policy };

            // Actualizar campos
            if (updatePolicyDto.name !== undefined) policy.name = updatePolicyDto.name;
            if (updatePolicyDto.description !== undefined) policy.description = updatePolicyDto.description;
            if (updatePolicyDto.priority !== undefined) policy.priority = updatePolicyDto.priority;
            if (updatePolicyDto.effect !== undefined) policy.effect = updatePolicyDto.effect;
            if (updatePolicyDto.conditions !== undefined) policy.conditions = updatePolicyDto.conditions;
            policy.updatedBy = updatePolicyDto.updatedBy ?? policy.updatedBy;

            const updatedPolicy = await queryRunner.manager.save(policy);
            await queryRunner.commitTransaction();

            // Registrar auditoría
            const changes = this.getChanges(previousState, updatedPolicy);
            await this.auditService.logCrudEvent(AuditAction.UPDATE, {
                entityType: EntityType.POLICY,
                entityId: policyId,
                userId: updatePolicyDto.updatedBy ?? 'system',
                userEmail: 'system', // Se debería obtener del usuario real
                applicationId: policy.applicationId,
                applicationName: policy.application?.name,
                changes,
            });

            this.logger.log('Política actualizada', 'POLICY', {
                policyId,
                updatedBy: updatePolicyDto.updatedBy,
                changes,
            });

            return updatedPolicy;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al actualizar política', 'POLICY', (error as Error).stack, {
                policyId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async deletePolicy(policyId: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verificar si la politica existe
            const policy = await queryRunner.manager.findOne(Policy, {
                where: { id: policyId },
                relations: ['application'],
            });

            if (!policy) {
                throw new NotFoundException('Política no encontrada');
            }

            await queryRunner.manager.delete(Policy, { id: policyId });
            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.DELETE, {
                entityType: EntityType.POLICY,
                entityId: policyId,
                userId: policy.createdBy,
                userEmail: 'system', // Se debería obtener del usuario real
                applicationId: policy.applicationId,
                applicationName: policy.application.name,
                changes: { policyId },
            });

            this.logger.log('Política eliminada', 'POLICY', {
                policyId,
                deletedBy: policy.createdBy,
            });
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al eliminar política', 'POLICY', (error as Error).stack, {
                policyId,
                error: (error as Error).message,
            });
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }

    /**
     * Agrega una regla a una política
     */
    async addPolicyRule(policyId: string, createRuleDto: CreatePolicyRuleDto): Promise<PolicyRule> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verificar que la política existe
            const policy = await queryRunner.manager.findOne(Policy, {
                where: { id: policyId, isActive: true },
                relations: ['application'],
            });

            if (!policy) {
                throw new NotFoundException('Política no encontrada');
            }

            // Validar la condición
            if (!RuleValidator.isValidCondition(createRuleDto.conditions)) {
                throw new BadRequestException('Estructura de condición inválida');
            }

            // Normalizar la condición
            const normalizedCondition = RuleValidator.normalizeCondition(createRuleDto.conditions);

            const rule = this.policyRuleRepository.create({
                condition: normalizedCondition,
                operator: createRuleDto.operator || 'AND',
                priority: createRuleDto.priority || 0,
                ruleType: createRuleDto.ruleType,
                policyId: policyId,
                createdBy: createRuleDto.createdBy,
            });

            const savedRule = await queryRunner.manager.save(rule);
            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.CREATE, {
                entityType: EntityType.POLICY_RULE,
                entityId: savedRule.id,
                userId: createRuleDto.createdBy ?? 'system',
                userEmail: 'system',
                applicationId: policy.applicationId,
                applicationName: policy.application?.name,
                changes: createRuleDto,
            });

            this.logger.log('Regla de política agregada', 'POLICY', {
                policyId,
                ruleId: savedRule.id,
                createdBy: createRuleDto.createdBy,
            });

            return savedRule;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al agregar regla a política', 'POLICY', (error as Error).stack, {
                policyId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Agrega un permiso a una política
     */
    async addPermissionToPolicy(
        policyId: string,
        permissionId: string,
        createdBy: string,
    ): Promise<PolicyPermission> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verificar que la política y el permiso existen
            const policy = await queryRunner.manager.findOne(Policy, {
                where: { id: policyId, isActive: true },
                relations: ['application'],
            });

            const permission = await queryRunner.manager.findOne(Permission, {
                where: { id: permissionId, isActive: true },
            });

            if (!policy) throw new NotFoundException('Política no encontrada');
            if (!permission) throw new NotFoundException('Permiso no encontrado');

            // Verificar si la relación ya existe
            const existingRelation = await queryRunner.manager.findOne(PolicyPermission, {
                where: { policyId, permissionId },
            });

            if (existingRelation) {
                throw new ConflictException('El permiso ya está asignado a esta política');
            }

            // Crear la relación
            const policyPermission = this.policyPermissionRepository.create({
                policyId,
                permissionId,
                createdBy,
            });

            const savedRelation = await queryRunner.manager.save(policyPermission);
            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.PERMISSION_GRANT, {
                entityType: EntityType.POLICY,
                entityId: policyId,
                userId: createdBy,
                userEmail: 'system',
                applicationId: policy.applicationId,
                applicationName: policy.application?.name,
                changes: {
                    permissionId,
                    permission: `${permission.resource}:${permission.action}`,
                },
            });

            this.logger.log('Permiso agregado a política', 'POLICY', {
                policyId,
                permissionId,
                createdBy,
            });

            return savedRelation;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al agregar permiso a política', 'POLICY', (error as Error).stack, {
                policyId,
                permissionId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Elimina un permiso de una política
     */
    async removePermissionFromPolicy(policyId: string, permissionId: string, deletedBy: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const policy = await queryRunner.manager.findOne(Policy, {
                where: { id: policyId },
                relations: ['application'],
            });

            if (!policy) {
                throw new NotFoundException('Política no encontrada');
            }

            const result = await queryRunner.manager.delete(PolicyPermission, {
                policyId,
                permissionId,
            });

            if (result.affected === 0) {
                throw new NotFoundException('Relación política-permiso no encontrada');
            }

            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.PERMISSION_REVOKE, {
                entityType: EntityType.POLICY,
                entityId: policyId,
                userId: deletedBy,
                userEmail: 'system',
                applicationId: policy.applicationId,
                applicationName: policy.application?.name,
                changes: { permissionId },
            });

            this.logger.log('Permiso removido de política', 'POLICY', {
                policyId,
                permissionId,
                deletedBy,
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al remover permiso de política', 'POLICY', (error as Error).stack, {
                policyId,
                permissionId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Elimina una regla de política
     */
    async deletePolicyRule(ruleId: string, deletedBy: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const rule = await queryRunner.manager.findOne(PolicyRule, {
                where: { id: ruleId },
                relations: ['policy', 'policy.application'],
            });

            if (!rule) {
                throw new NotFoundException('Regla de política no encontrada');
            }

            const result = await queryRunner.manager.delete(PolicyRule, { id: ruleId });

            if (result.affected === 0) {
                throw new NotFoundException('Regla de política no encontrada');
            }

            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.DELETE, {
                entityType: EntityType.POLICY_RULE,
                entityId: ruleId,
                userId: deletedBy,
                userEmail: 'system',
                applicationId: rule.policy.applicationId,
                applicationName: rule.policy.application?.name,
                changes: { ruleId },
            });

            this.logger.log('Regla de política eliminada', 'POLICY', {
                ruleId,
                policyId: rule.policyId,
                deletedBy,
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al eliminar regla de política', 'POLICY', (error as Error).stack, {
                ruleId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Desactiva una política (soft delete)
     */
    async deactivatePolicy(policyId: string, deletedBy: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const policy = await queryRunner.manager.findOne(Policy, {
                where: { id: policyId },
                relations: ['application'],
            });

            if (!policy) {
                throw new NotFoundException('Política no encontrada');
            }

            if (policy.type === 'system') {
                throw new ForbiddenException('No se pueden desactivar políticas del sistema');
            }

            await queryRunner.manager.update(
                Policy,
                { id: policyId },
                {
                    isActive: false,
                    updatedBy: deletedBy
                }
            );

            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.DEACTIVATE, {
                entityType: EntityType.POLICY,
                entityId: policyId,
                userId: deletedBy,
                userEmail: 'system',
                applicationId: policy.applicationId,
                applicationName: policy.application?.name,
                changes: { policyId },
            });

            this.logger.log('Política desactivada', 'POLICY', {
                policyId,
                deletedBy,
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al desactivar política', 'POLICY', (error as Error).stack, {
                policyId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Reactiva una política
     */
    async reactivatePolicy(policyId: string, reactivatedBy: string): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const policy = await queryRunner.manager.findOne(Policy, {
                where: { id: policyId },
                relations: ['application'],
            });

            if (!policy) {
                throw new NotFoundException('Política no encontrada');
            }

            await queryRunner.manager.update(
                Policy,
                { id: policyId },
                {
                    isActive: true,
                    updatedBy: reactivatedBy
                }
            );

            await queryRunner.commitTransaction();

            // Registrar auditoría
            await this.auditService.logCrudEvent(AuditAction.REACTIVATE, {
                entityType: EntityType.POLICY,
                entityId: policyId,
                userId: reactivatedBy,
                userEmail: 'system',
                applicationId: policy.applicationId,
                applicationName: policy.application?.name,
                changes: { policyId },
            });

            this.logger.log('Política reactivada', 'POLICY', {
                policyId,
                reactivatedBy,
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al reactivar política', 'POLICY', (error as Error).stack, {
                policyId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Obtiene los permisos de una política
     */
    async getPolicyPermissions(policyId: string): Promise<PolicyPermission[]> {
        const policy = await this.policyRepository.findOne({
            where: { id: policyId },
            relations: ['permissions', 'permissions.permission'],
        });

        if (!policy) {
            throw new NotFoundException('Política no encontrada');
        }

        return policy.permissions;
    }

    /**
     * Obtiene las reglas de una política
     */
    async getPolicyRules(policyId: string): Promise<PolicyRule[]> {
        const policy = await this.policyRepository.findOne({
            where: { id: policyId },
            relations: ['rules'],
        });

        if (!policy) {
            throw new NotFoundException('Política no encontrada');
        }

        return policy.rules;
    }

    /**
     * Valida una condición de regla
     */
    validateRuleCondition(condition: any): { isValid: boolean; error?: string } {
        try {
            const isValid = RuleValidator.isValidCondition(condition);
            return { isValid };
        } catch (error) {
            return { isValid: false, error: (error as Error).message };
        }
    }

    /**
     * Helper para detectar cambios entre estados
     */
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
}
