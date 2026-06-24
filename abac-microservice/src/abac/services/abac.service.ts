import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Engine, Rule } from 'json-rules-engine';

import { UserApplication } from '../../entities/user-application.entity';
import { Role } from '../../entities/role.entity';
import { Policy } from '../../entities/policy.entity';
import { PolicyRule } from '../../entities/policy-rule.entity';
import { RolePermission } from '../../entities/role-permission.entity';
import { PolicyPermission } from '../../entities/policy-permission.entity';

import { CorrelationIdService, LoggerService } from '../../observability';
import { RuleCondition, Condition } from '../interfaces/rules.interface';
import { RuleValidator } from '../utils/rule-validator.util';
import { CacheService } from 'src/cache';
import { TracingService } from '../../observability';
import { AbacMetricsService } from './abac-metrics.service';

/**
 * @description
 * Servicio central del motor ABAC (Attribute Based Access Control) optimizado.
 * Se encarga de validar si un usuario puede realizar una acción sobre un recurso
 * dentro de una aplicación, basado en sus roles, permisos y políticas.
 * @link https://www.npmjs.com/package/json-rules-engine
 */
@Injectable()
export class AbacService {
    constructor(
        @InjectRepository(UserApplication) private readonly userAppRepo: Repository<UserApplication>,
        @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
        @InjectRepository(Policy) private readonly policyRepo: Repository<Policy>,
        @InjectRepository(RolePermission) private readonly rolePermRepo: Repository<RolePermission>,
        @InjectRepository(PolicyPermission) private readonly policyPermRepo: Repository<PolicyPermission>,
        private readonly correlation: CorrelationIdService,
        private readonly cache: CacheService,
        private readonly logger: LoggerService,
        @Optional() private readonly tracing: TracingService,
        @Optional() private readonly abacMetrics: AbacMetricsService,
    ) { }

    /**
     * @description
     * Evalúa si un usuario puede acceder a un recurso/acción en una aplicación.
     * Implementa short-circuit de caché en cada paso antes de ir a la BD.
     */
    async canAccess(userId: string, appId: string, resource: string, action: string, context: Record<string, any> = {}): Promise<boolean> {
        const execute = async (): Promise<boolean> => {
            const cid = this.correlation.getCorrelationId() ?? '';
            const startTime = Date.now();
            const hasContext = Object.keys(context).length > 0;

            // === CACHÉ: solo cuando NO hay context (context cambia el resultado) ===
            const cacheKey = this.generateKeyGranted(userId, appId, resource, action);
            if (!hasContext) {
                const cached = await this.cache.get<boolean>(cacheKey);
                if (cached !== null) {
                    this.abacMetrics?.recordCacheHit();
                    this.abacMetrics?.recordAccessDecision(resource, action, cached, Date.now() - startTime);
                    this.logger.debug('Decisión obtenida de caché', 'ABAC', { cid, userId, appId, resource, action, cached });
                    return cached;
                }
            }

            this.abacMetrics?.recordCacheMiss();

            try {
                // === PASO 1: Validar acceso a la aplicación ===
                const userApplication = await this.validateUserApplication(userId, appId);
                if (!userApplication) {
                    if (!hasContext) await this.cache.set(cacheKey, false, 60 * 60);
                    this.logger.debug('Denegado: sin acceso a la aplicación', 'ABAC', { cid, userId, appId });
                    return false;
                }

                // === PASO 2: Verificar permisos efectivos ===
                const permissionsMap = await this.getUserPermissions(userId, appId, resource, action);
                const perm = permissionsMap.get(`${resource}:${action}`);
                if (!perm || perm.effect === 'deny') {
                    if (!hasContext) await this.cache.set(cacheKey, false, 60 * 60);
                    this.logger.debug('Denegado: sin permisos para el recurso', 'ABAC', { cid, userId, appId, resource, action });
                    return false;
                }

                // === PASO 3: Evaluar políticas ===
                const policies = await this.getRelevantPolicies(appId, resource, action);
                this.abacMetrics?.recordPoliciesEvaluated(policies.length);

                let granted: boolean;
                if (policies.length === 0) {
                    granted = true; // perm.effect is 'allow' (deny was short-circuited above)
                } else {
                    const userRoles = await this.getUserRoles(userId, appId);
                    const facts = this.buildFacts(userApplication, context, userRoles);
                    const policyResult = await this.evaluatePolicies(policies, facts, { cid, userId, appId, resource, action });
                    granted = policyResult !== null ? policyResult : true;
                }

                if (!hasContext) await this.cache.set(cacheKey, granted, 60 * 60);

                const processingTime = Date.now() - startTime;
                this.abacMetrics?.recordAccessDecision(resource, action, granted, processingTime);
                this.logger.log(`Decisión de acceso: ${granted ? 'PERMIT' : 'DENY'}`, 'ABAC', {
                    cid, userId, appId, resource, action, granted, processingTime, policiesEvaluated: policies.length,
                });

                return granted;

            } catch (error) {
                const processingTime = Date.now() - startTime;
                this.logger.error('Error en evaluación ABAC', 'ABAC', (error as Error).stack, {
                    cid, userId, appId, resource, action, error: (error as Error).message, processingTime,
                });
                return false;
            }
        };

        if (this.tracing) {
            return this.tracing.run(
                'abac.canAccess',
                { attributes: { 'abac.userId': userId, 'abac.appId': appId, 'abac.resource': resource, 'abac.action': action } },
                execute,
            );
        }

        return execute();
    }

    async validateUserApplication(userId: string, appId: string): Promise<UserApplication | null> {
        const userApp = await this.userAppRepo.findOne({
            where: { userId, applicationId: appId, isActive: true },
            relations: ['user', 'application'],
        });

        return userApp;
    }

    /**
     * Obtiene todos los permisos efectivos del usuario (roles + políticas)
     */
    async getUserPermissions(userId: string, appId: string, resource?: string, action?: string): Promise<Map<string, { effect: 'allow' | 'deny' }>> {
        const permissionsMap = new Map<string, { effect: 'allow' | 'deny' }>();

        // 1. Permisos directos a través de roles
        const rolePermissionsQuery = this.rolePermRepo
            .createQueryBuilder('rp')
            .innerJoinAndSelect('rp.role', 'role')
            .innerJoinAndSelect('rp.permission', 'permission')
            .innerJoin('role.userRoles', 'userRole', 'userRole.userId = :userId AND userRole.isActive = true', { userId })
            .where('role.applicationId = :appId', { appId })
            .andWhere('role.isActive = true')
            .andWhere('rp.isActive = true')
            .andWhere('permission.isActive = true');

        if (resource) rolePermissionsQuery.andWhere('permission.resource = :resource', { resource });
        if (action) rolePermissionsQuery.andWhere('permission.action = :action', { action });

        const rolePermissions = await rolePermissionsQuery.getMany();

        for (const rp of rolePermissions) {
            const key = `${rp.permission.resource}:${rp.permission.action}`;
            const existing = permissionsMap.get(key);
            // Deny siempre gana: si ya hay un deny, no sobreescribir con allow
            if (!existing || rp.effect === 'deny') {
                permissionsMap.set(key, { effect: rp.effect });
            }
        }

        // 2. Permisos a través de políticas (si no se especificó recurso/acción específico)
        if (!resource || !action) {
            const policyPermissions = await this.policyPermRepo
                .createQueryBuilder('pp')
                .innerJoinAndSelect('pp.policy', 'policy')
                .innerJoinAndSelect('pp.permission', 'permission')
                .where('policy.applicationId = :appId', { appId })
                .andWhere('policy.isActive = true')
                .andWhere('pp.isActive = true')
                .andWhere('permission.isActive = true')
                .getMany();

            for (const pp of policyPermissions) {
                const key = `${pp.permission.resource}:${pp.permission.action}`;
                const existing = permissionsMap.get(key);
                // No sobreescribir un deny existente con allow de policy
                if (!existing) {
                    permissionsMap.set(key, { effect: 'allow' });
                }
            }
        }

        return permissionsMap;
    }

    /**
     * Obtiene políticas relevantes para el recurso/acción solicitado
     */
    private async getRelevantPolicies(appId: string, resource: string, action: string): Promise<Policy[]> {
        return this.policyRepo
            .createQueryBuilder('policy')
            .innerJoinAndSelect('policy.permissions', 'policyPermission')
            .innerJoinAndSelect('policyPermission.permission', 'permission')
            .leftJoinAndSelect('policy.rules', 'rule', 'rule.isActive = true')
            .where('policy.applicationId = :appId', { appId })
            .andWhere('policy.isActive = true')
            .andWhere('permission.resource = :resource', { resource })
            .andWhere('permission.action = :action', { action })
            .andWhere('permission.isActive = true')
            .orderBy('policy.priority', 'DESC')
            .getMany();
    }

    private buildFacts(userApp: UserApplication, context: Record<string, any>, roles: Role[] = []): any {
        return {
            user: {
                id: userApp.user.id,
                email: userApp.user.email,
                name: userApp.user.username,
                profile: userApp.user.profile || {},
                attributes: userApp.attributes || {},
                roles: roles.map(r => r.name),
            },
            application: {
                id: userApp.application.id,
                name: userApp.application.name,
                environment: userApp.application.environment,
            },
            membership: {
                type: userApp.membershipType,
                expiresAt: userApp.membershipExpiresAt,
                isExpired: userApp.membershipExpiresAt ? new Date() > userApp.membershipExpiresAt : false,
            },
            context: {
                ...context,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * Evalúa las políticas contra los facts.
     * Retorna boolean si alguna política matcheó, null si ninguna matcheó.
     * Mejora: crea un Engine por política con todas sus reglas juntas.
     */
    private async evaluatePolicies(
        policies: Policy[],
        facts: any,
        metadata: { cid: string; userId: string; appId: string; resource: string; action: string }
    ): Promise<boolean | null> {
        const { cid, userId, appId, resource, action } = metadata;

        for (const policy of policies) {
            try {
                // Sin reglas → aplicar efecto directamente
                if (!policy.rules || policy.rules.length === 0) {
                    const effect = policy.effect;
                    if (effect !== 'allow' && effect !== 'deny') {
                        this.logger.warn(`Política ${policy.id} tiene efecto inválido: "${effect}" — tratando como deny`, 'ABAC');
                        return false;
                    }
                    this.logger.debug('Política aplicada sin reglas (efecto por defecto)', 'ABAC', {
                        cid, userId, appId, resource, action, policyId: policy.id, policyEffect: effect
                    });
                    return effect === 'allow';
                }

                const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);
                const validRules = sortedRules.filter(r => r.isActive && r.isValidCondition());

                if (validRules.length === 0) continue;

                // Un solo Engine por política con todas las reglas
                const engine = new Engine();
                for (const rule of validRules) {
                    engine.addRule(this.createRuleDefinition(rule));
                }

                const results = await engine.run(this.flattenFacts(facts));
                const allRulesPassed = results.failureResults.length === 0;

                if (allRulesPassed) {
                    this.logger.debug('Política aplicada exitosamente', 'ABAC', {
                        cid, userId, appId, resource, action, policyId: policy.id, policyEffect: policy.effect
                    });
                    return policy.effect === 'allow';
                }

            } catch (error) {
                this.logger.warn('Error evaluando política completa', 'ABAC', {
                    cid, userId, appId, policyId: policy.id, error: (error as Error).message
                });
                // Continuar con la siguiente política
            }
        }

        // Ninguna política aplicó
        return null;
    }

    /**
     * Aplana un objeto de facts para que tanto 'user' como 'user.roles' existan como claves.
     * Reglas que usan `fact: 'user.roles'` (nombre con punto) funcionan junto a
     * reglas que usan `fact: 'membership', path: '$.type'` (acceso por path).
     */
    private flattenFacts(obj: Record<string, any>, prefix = ''): Record<string, any> {
        const flat: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            flat[fullKey] = value;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(flat, this.flattenFacts(value, fullKey));
            }
        }
        return flat;
    }

    /**
     * Crea una definición de regla compatible con json-rules-engine
     */
    private createRuleDefinition(rule: PolicyRule): Rule {
        try {
            const normalizedCondition = RuleValidator.normalizeCondition(rule.condition);
            return new Rule({
                conditions: normalizedCondition as any,
                event: { type: 'access_granted' },
                name: `policy-${rule.policyId}-rule-${rule.id}`,
                priority: rule.priority
            });
        } catch (error) {
            throw new Error(`Invalid rule condition for rule ${rule.id}: ${(error as Error)?.message}`);
        }
    }

    async getUserRoles(userId: string, appId: string): Promise<Role[]> {
        return this.roleRepo
            .createQueryBuilder('role')
            .innerJoin('role.userRoles', 'userRole', 'userRole.userId = :userId AND userRole.isActive = true', { userId })
            .where('role.applicationId = :appId', { appId })
            .andWhere('role.isActive = true')
            .getMany();
    }

    /**
     * Bug 5 fix: eliminada la cláusula orWhere('role.id IN ...') que usaba un alias sin join.
     */
    async getUserPolicies(userId: string, appId: string): Promise<Policy[]> {
        return this.policyRepo
            .createQueryBuilder('policy')
            .leftJoin('policy.permissions', 'policyPermission')
            .leftJoin('policyPermission.permission', 'permission')
            .where('policy.applicationId = :appId', { appId })
            .andWhere('policy.isActive = true')
            .andWhere(
                new Brackets(qb => {
                    qb.where('policy.type = :systemType', { systemType: 'system' })
                        .orWhere('policy.type = :userType', { userType: 'user' });
                })
            )
            .getMany();
    }

    /**
     * Bug 6 fix: implementación real de invalidación de caché.
     */
    async invalidateUserCache(userId: string, appId: string): Promise<void> {
        await this.cache.deletePattern(`abac_granted:${userId}:${appId}`);
        this.logger.debug('Cache invalidado para usuario', 'ABAC', { userId, appId });
    }

    createTimeCondition(startTime: string, endTime: string): Condition {
        return RuleValidator.createCondition('context.time', 'in', [startTime, endTime]);
    }

    createRoleCondition(roles: string[]): Condition {
        return RuleValidator.createCondition('user.role', 'in', roles);
    }

    createDepartmentCondition(departments: string[]): Condition {
        return RuleValidator.createCondition('user.department', 'in', departments);
    }

    createAndCondition(conditions: Condition[]): RuleCondition {
        return RuleValidator.createAndCondition(conditions);
    }

    createOrCondition(conditions: Condition[]): RuleCondition {
        return RuleValidator.createOrCondition(conditions);
    }

    createNotCondition(condition: Condition): RuleCondition {
        return RuleValidator.createNotCondition(condition);
    }

    validateRuleCondition(condition: any): { isValid: boolean; error?: string } {
        try {
            const isValid = RuleValidator.isValidCondition(condition);
            return { isValid };
        } catch (error) {
            return { isValid: false, error: (error as Error).message };
        }
    }

    async getEvaluationStats(_applicationId: string): Promise<{
        totalEvaluations: number;
        granted: number;
        denied: number;
        averageProcessingTime: number;
        mostEvaluatedResources: Array<{ resource: string; action: string; count: number }>;
        note: string;
    }> {
        // Stats en tiempo real no implementadas — usar audit logs para métricas históricas
        return {
            totalEvaluations: 0,
            granted: 0,
            denied: 0,
            averageProcessingTime: 0,
            mostEvaluatedResources: [],
            note: 'not_implemented',
        };
    }

    // === CACHÉ ===

    generateKeyGranted(userId: string, appId: string, resource: string, action: string): string {
        return `abac_granted:${userId}:${appId}:${resource}:${action}`;
    }
}
