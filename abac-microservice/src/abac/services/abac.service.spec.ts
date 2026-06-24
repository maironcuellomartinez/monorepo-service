import { Test, TestingModule } from '@nestjs/testing';
import { AbacService } from './abac.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserApplication } from '../../entities/user-application.entity';
import { Role } from '../../entities/role.entity';
import { Policy } from '../../entities/policy.entity';
import { PolicyRule } from '../../entities/policy-rule.entity';
import { RolePermission } from '../../entities/role-permission.entity';
import { PolicyPermission } from '../../entities/policy-permission.entity';
import { CorrelationIdService } from '../../observability';
import { CacheService } from '../../cache';
import { LoggerService } from '../../observability';
import { AbacMetricsService } from './abac-metrics.service';

describe('AbacService', () => {
    let service: AbacService;

    // ── Mock factories ────────────────────────────────────────────

    const createQueryBuilder = (getMany: any[] = []) => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(getMany),
    });

    const mockUserAppRepo = {
        findOne: jest.fn(),
        createQueryBuilder: jest.fn(() => createQueryBuilder()),
    };

    const mockRoleRepo = {
        createQueryBuilder: jest.fn(() => createQueryBuilder()),
    };

    const mockPolicyRepo = {
        createQueryBuilder: jest.fn(() => createQueryBuilder()),
    };

    const mockRolePermRepo = {
        createQueryBuilder: jest.fn(() => createQueryBuilder()),
    };

    const mockPolicyPermRepo = {
        createQueryBuilder: jest.fn(() => createQueryBuilder()),
    };

    const mockCacheService = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        deletePattern: jest.fn(),
    };

    const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    };

    const mockCorrelationId = {
        getCorrelationId: jest.fn().mockReturnValue('test-cid'),
    };

    const mockMetrics = {
        recordCacheHit: jest.fn(),
        recordCacheMiss: jest.fn(),
        recordAccessDecision: jest.fn(),
        recordPoliciesEvaluated: jest.fn(),
    };

    // ── Setup ─────────────────────────────────────────────────────

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AbacService,
                { provide: getRepositoryToken(UserApplication), useValue: mockUserAppRepo },
                { provide: getRepositoryToken(Role), useValue: mockRoleRepo },
                { provide: getRepositoryToken(Policy), useValue: mockPolicyRepo },
                { provide: getRepositoryToken(RolePermission), useValue: mockRolePermRepo },
                { provide: getRepositoryToken(PolicyPermission), useValue: mockPolicyPermRepo },
                { provide: CorrelationIdService, useValue: mockCorrelationId },
                { provide: CacheService, useValue: mockCacheService },
                { provide: LoggerService, useValue: mockLogger },
                { provide: AbacMetricsService, useValue: mockMetrics },
            ],
        }).compile();

        service = module.get<AbacService>(AbacService);
        jest.clearAllMocks();

        // Defaults
        mockCacheService.get.mockResolvedValue(null);
    });

    // ═══════════════ canAccess ══════════════════════════════════════

    describe('canAccess', () => {
        const userId = 'user-1';
        const appId = 'app-1';
        const resource = 'document';
        const action = 'read';

        const mockUserApp = {
            userId,
            applicationId: appId,
            isActive: true,
            membershipType: 'standard',
            membershipExpiresAt: null,
            attributes: {},
            user: { id: userId, email: 'test@test.com', username: 'test', profile: {} },
            application: { id: appId, name: 'Test App', environment: 'development' },
        };

        it('should return false if user has no access to application', async () => {
            mockUserAppRepo.findOne.mockResolvedValue(null);

            const result = await service.canAccess(userId, appId, resource, action);

            expect(result).toBe(false);
            expect(mockCacheService.set).toHaveBeenCalledWith(
                expect.stringContaining('abac_granted'),
                false,
                3600,
            );
        });

        it('should return false if user has no permissions for resource', async () => {
            mockUserAppRepo.findOne.mockResolvedValue(mockUserApp);
            mockRolePermRepo.createQueryBuilder.mockImplementation(() => createQueryBuilder([]));

            const result = await service.canAccess(userId, appId, resource, action);

            expect(result).toBe(false);
        });

        it('should return true if user has allow permission and no policies', async () => {
            mockUserAppRepo.findOne.mockResolvedValue(mockUserApp);

            // Role permissions: allow
            mockRolePermRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([{ permission: { resource, action }, effect: 'allow' }]),
            );

            // No policies
            mockPolicyRepo.createQueryBuilder.mockImplementation(() => createQueryBuilder([]));

            const result = await service.canAccess(userId, appId, resource, action);

            expect(result).toBe(true);
        });

        it('should return false when permission effect is deny (deny wins)', async () => {
            mockUserAppRepo.findOne.mockResolvedValue(mockUserApp);

            // Return both allow and deny — deny should win
            mockRolePermRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([
                    { permission: { resource, action }, effect: 'allow', role: { id: 'r1' } },
                    { permission: { resource, action }, effect: 'deny', role: { id: 'r2' } },
                ]),
            );

            const result = await service.canAccess(userId, appId, resource, action);

            expect(result).toBe(false);
        });

        // ── Cache behavior ────────────────────────────────────────

        it('should return cached result when available (no context)', async () => {
            mockCacheService.get.mockResolvedValue(true);

            const result = await service.canAccess(userId, appId, resource, action);

            expect(result).toBe(true);
            expect(mockUserAppRepo.findOne).not.toHaveBeenCalled();
            expect(mockMetrics.recordCacheHit).toHaveBeenCalled();
        });

        it('should skip cache when context is provided', async () => {
            mockCacheService.get.mockResolvedValue(true); // cache has value
            mockUserAppRepo.findOne.mockResolvedValue(null); // but user has no access

            const result = await service.canAccess(userId, appId, resource, action, { ip: '10.0.0.1' });

            // Should NOT return cached true — should evaluate and return false
            expect(result).toBe(false);
            expect(mockMetrics.recordCacheMiss).toHaveBeenCalled();
        });

        it('should not cache result when context is provided', async () => {
            mockUserAppRepo.findOne.mockResolvedValue(mockUserApp);
            mockRolePermRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([{ permission: { resource, action }, effect: 'allow' }]),
            );
            mockPolicyRepo.createQueryBuilder.mockImplementation(() => createQueryBuilder([]));

            await service.canAccess(userId, appId, resource, action, { ip: '10.0.0.1' });

            expect(mockCacheService.set).not.toHaveBeenCalled();
        });

        // ── Policy evaluation ─────────────────────────────────────

        it('should apply policy effect when policy has no rules', async () => {
            mockUserAppRepo.findOne.mockResolvedValue(mockUserApp);
            mockRolePermRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([{ permission: { resource, action }, effect: 'allow' }]),
            );

            // Policy with effect=deny and no rules → should deny
            mockPolicyRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([{
                    id: 'policy-1',
                    effect: 'deny',
                    priority: 10,
                    rules: [],
                    permissions: [{ permission: { resource, action } }],
                }]),
            );

            const result = await service.canAccess(userId, appId, resource, action);

            expect(result).toBe(false);
        });

        // ── Error handling ────────────────────────────────────────

        it('should return false on unexpected errors (fail-safe)', async () => {
            mockUserAppRepo.findOne.mockRejectedValue(new Error('DB connection lost'));

            const result = await service.canAccess(userId, appId, resource, action);

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // ═══════════════ validateUserApplication ═══════════════════════

    describe('validateUserApplication', () => {
        it('should return UserApplication when found', async () => {
            const ua = { userId: 'u1', applicationId: 'a1', isActive: true };
            mockUserAppRepo.findOne.mockResolvedValue(ua);

            const result = await service.validateUserApplication('u1', 'a1');

            expect(result).toBe(ua);
            expect(mockUserAppRepo.findOne).toHaveBeenCalledWith({
                where: { userId: 'u1', applicationId: 'a1', isActive: true },
                relations: ['user', 'application'],
            });
        });

        it('should return null when not found', async () => {
            mockUserAppRepo.findOne.mockResolvedValue(null);

            const result = await service.validateUserApplication('u1', 'a1');

            expect(result).toBeNull();
        });
    });

    // ═══════════════ getUserPermissions ═════════════════════════════

    describe('getUserPermissions', () => {
        it('should return permissions map with deny winning over allow', async () => {
            mockRolePermRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([
                    { permission: { resource: 'doc', action: 'read' }, effect: 'allow' },
                    { permission: { resource: 'doc', action: 'read' }, effect: 'deny' },
                    { permission: { resource: 'doc', action: 'write' }, effect: 'allow' },
                ]),
            );

            const result = await service.getUserPermissions('u1', 'a1', 'doc', 'read');

            expect(result.get('doc:read')?.effect).toBe('deny');
            expect(result.get('doc:write')?.effect).toBe('allow');
        });

        it('should include policy permissions when resource/action not specified', async () => {
            mockRolePermRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([
                    { permission: { resource: 'doc', action: 'read' }, effect: 'allow' },
                ]),
            );

            mockPolicyPermRepo.createQueryBuilder.mockImplementation(() =>
                createQueryBuilder([
                    { permission: { resource: 'incident', action: 'create' }, policy: { id: 'p1' } },
                ]),
            );

            const result = await service.getUserPermissions('u1', 'a1');

            expect(result.has('doc:read')).toBe(true);
            expect(result.has('incident:create')).toBe(true);
        });
    });

    // ═══════════════ invalidateUserCache ════════════════════════════

    describe('invalidateUserCache', () => {
        it('should delete cache pattern for user+app', async () => {
            await service.invalidateUserCache('u1', 'a1');

            expect(mockCacheService.deletePattern).toHaveBeenCalledWith('abac_granted:u1:a1');
        });
    });

    // ═══════════════ generateKeyGranted ═════════════════════════════

    describe('generateKeyGranted', () => {
        it('should generate deterministic cache key', () => {
            const key = service.generateKeyGranted('u1', 'a1', 'doc', 'read');

            expect(key).toBe('abac_granted:u1:a1:doc:read');
        });
    });

    // ═══════════════ condition helpers ══════════════════════════════

    describe('condition helpers', () => {
        it('should create time condition', () => {
            const cond = service.createTimeCondition('09:00', '17:00');
            expect(cond).toBeDefined();
        });

        it('should create role condition', () => {
            const cond = service.createRoleCondition(['admin', 'editor']);
            expect(cond).toBeDefined();
        });

        it('should validate rule conditions', () => {
            const valid = service.validateRuleCondition({
                all: [{ fact: 'user.role', operator: 'in', value: ['admin'] }],
            });
            expect(valid.isValid).toBe(true);
        });

        it('should return invalid for bad conditions', () => {
            const invalid = service.validateRuleCondition('not-an-object');
            expect(invalid.isValid).toBe(false);
        });
    });
});
