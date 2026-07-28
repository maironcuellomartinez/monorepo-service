import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { EntraIdService } from './entra-id.service';
import { AuditService } from './audit.service';
import { OauthService } from './oauth.service';
import { Application, RolePermission, User, UserApplication, UserRole } from '../../entities';
import { LoggerService } from '../../observability';
import { Result } from '../../common/result/result';
import { JwtEd25519Service } from '../../common/crypto/jwt-ed25519.service';

describe('AuthService', () => {
    let service: AuthService;

    // ── Mock factories ─────────────────────────────────────────────────

    const mockUserRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };

    const mockAppRepo = {
        findOne: jest.fn(),
        increment: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ affected: 1 }),
        })),
    };

    const mockRolePermRepo = {
        find: jest.fn().mockResolvedValue([]),
    };

    const mockUserRoleRepo = {
        find: jest.fn().mockResolvedValue([]),
    };

    const mockUserAppRepo = {
        findOne: jest.fn(),
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue({}),
    };

    const mockJwtService = {
        sign: jest.fn().mockReturnValue('jwt-token-mock'),
        verify: jest.fn(),
    };

    const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    };

    const mockEntraIdService = {
        validate: jest.fn(),
    };

    const mockAuditService = {
        logEvent: jest.fn().mockResolvedValue(undefined),
        logCrudEvent: jest.fn().mockResolvedValue(undefined),
    };

    const mockOauthService = {
        generateToken: jest.fn(),
    };

    // ── Setup ──────────────────────────────────────────────────────────

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: getRepositoryToken(User), useValue: mockUserRepo },
                { provide: getRepositoryToken(Application), useValue: mockAppRepo },
                { provide: getRepositoryToken(RolePermission), useValue: mockRolePermRepo },
                { provide: getRepositoryToken(UserRole), useValue: mockUserRoleRepo },
                { provide: getRepositoryToken(UserApplication), useValue: mockUserAppRepo },
                { provide: JwtService, useValue: mockJwtService },
                { provide: LoggerService, useValue: mockLogger },
                { provide: AuditService, useValue: mockAuditService },
                { provide: EntraIdService, useValue: mockEntraIdService },
                { provide: OauthService, useValue: mockOauthService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        jest.clearAllMocks();
    });

    // ═══════════════ adminLogin ════════════════════════════════════════

    describe('adminLogin', () => {
        const email = 'admin@test.com';
        const password = 'Admin123!';
        const userId = 'user-admin-001';
        const appId = 'app-001';

        const adminUser = {
            id: userId,
            email,
            passwordHash: '$2a$10$hashedpassword',
            firstName: 'Admin',
            lastName: 'User',
            accountType: 'user',
            isActive: true,
            lastLoginAt: null,
        };

        const adminRoles = [
            { userId, role: { id: 'role-sa', name: 'super-admin' }, isActive: true, applicationId: appId },
        ];

        it('should login successfully with valid admin credentials', async () => {
            mockUserRepo.findOne.mockResolvedValue(adminUser);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            mockUserRoleRepo.find.mockResolvedValue(adminRoles);
            mockRolePermRepo.find.mockResolvedValue([
                { roleId: 'role-sa', permission: { resource: 'user', action: 'read' } },
                { roleId: 'role-sa', permission: { resource: 'user', action: 'write' } },
            ]);
            mockUserRepo.save.mockResolvedValue(adminUser);

            const result = await service.adminLogin(email, password, appId);

            expect(result.isSuccess).toBe(true);
            const data = result.unwrap();
            expect(data.accessToken).toBe('jwt-token-mock');
            expect(data.tokenType).toBe('Bearer');
            expect(data.expiresIn).toBe(28800);
            expect(data.user.email).toBe(email);
            expect(data.user.roles).toContain('super-admin');
            expect(data.permissions).toEqual(['user:read', 'user:write']);
            expect(mockJwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({ sub: userId, type: 'admin', appId }),
                { expiresIn: '8h' },
            );
        });

        it('should return error for non-existent user', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            const result = await service.adminLogin(email, password, appId);

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Credenciales inválidas');
        });

        it('should return error for user without passwordHash (Entra ID user)', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...adminUser, passwordHash: null });

            const result = await service.adminLogin(email, password, appId);

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Credenciales inválidas');
        });

        it('should return error for wrong password', async () => {
            mockUserRepo.findOne.mockResolvedValue(adminUser);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

            const result = await service.adminLogin(email, password, appId);

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Credenciales inválidas');
        });

        it('should auto-resolve appId from user_applications when not provided', async () => {
            const originalEnv = process.env.ABAC_APP_ID;
            delete process.env.ABAC_APP_ID;

            mockUserRepo.findOne.mockResolvedValue(adminUser);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            mockUserAppRepo.findOne.mockResolvedValue({ userId, applicationId: appId, isActive: true });
            mockUserRoleRepo.find.mockResolvedValue(adminRoles);
            mockRolePermRepo.find.mockResolvedValue([]);
            mockUserRepo.save.mockResolvedValue(adminUser);

            const result = await service.adminLogin(email, password);

            expect(result.isSuccess).toBe(true);
            expect(mockUserAppRepo.findOne).toHaveBeenCalledWith({
                where: { userId, isActive: true },
                order: { createdAt: 'ASC' },
            });

            process.env.ABAC_APP_ID = originalEnv;
        });

        it('should return error when user has no application', async () => {
            const originalEnv = process.env.ABAC_APP_ID;
            delete process.env.ABAC_APP_ID;

            mockUserRepo.findOne.mockResolvedValue(adminUser);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            mockUserAppRepo.findOne.mockResolvedValue(null);

            const result = await service.adminLogin(email, password);

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('El usuario no está vinculado a ninguna aplicación');

            process.env.ABAC_APP_ID = originalEnv;
        });

        it('should return error for non-admin user', async () => {
            mockUserRepo.findOne.mockResolvedValue(adminUser);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            mockUserRoleRepo.find.mockResolvedValue([
                { userId, role: { id: 'r-viewer', name: 'viewer' }, isActive: true, applicationId: appId },
            ]);

            const result = await service.adminLogin(email, password, appId);

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Acceso denegado — se requiere rol de administrador');
        });

        it('should accept "admin" role (not just super-admin)', async () => {
            mockUserRepo.findOne.mockResolvedValue(adminUser);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            mockUserRoleRepo.find.mockResolvedValue([
                { userId, role: { id: 'r-admin', name: 'admin' }, isActive: true, applicationId: appId },
            ]);
            mockRolePermRepo.find.mockResolvedValue([]);
            mockUserRepo.save.mockResolvedValue(adminUser);

            const result = await service.adminLogin(email, password, appId);

            expect(result.isSuccess).toBe(true);
            expect(result.unwrap().user.roles).toContain('admin');
        });

        it('should update lastLoginAt on successful login', async () => {
            mockUserRepo.findOne.mockResolvedValue(adminUser);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            mockUserRoleRepo.find.mockResolvedValue(adminRoles);
            mockRolePermRepo.find.mockResolvedValue([]);
            mockUserRepo.save.mockResolvedValue(adminUser);

            await service.adminLogin(email, password, appId);

            expect(mockUserRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ lastLoginAt: expect.any(Date) }),
            );
        });
    });

    // ═══════════════ validateToken ═══════════════════════════════════

    describe('validateToken', () => {
        it('should return decoded payload when token is valid', async () => {
            const now = Math.floor(Date.now() / 1000);
            mockJwtService.verify.mockReturnValue({
                sub: 'user-1',
                email: 'test@test.com',
                exp: now + 3600,
            });

            const result = await service.validateToken('valid-token');

            expect(result.userId).toBe('user-1');
            expect(result.email).toBe('test@test.com');
            expect(result.expiresAt).toBeInstanceOf(Date);
        });

        it('should throw when token is invalid', async () => {
            mockJwtService.verify.mockImplementation(() => {
                throw new Error('jwt expired');
            });

            await expect(service.validateToken('expired-token')).rejects.toThrow();
        });
    });

    // ═══════════════ validateEntraToken ══════════════════════════════

    describe('validateEntraToken', () => {
        it('should validate Entra token and return userId + permissions', async () => {
            mockEntraIdService.validate.mockResolvedValue({
                oid: 'azure-oid-1',
                email: 'user@corp.com',
                name: 'John Doe',
            });

            // syncEntraUser path: user exists
            mockUserRepo.findOne.mockResolvedValue({
                id: 'user-1',
                entraId: 'azure-oid-1',
                email: 'user@corp.com',
                lastLoginAt: null,
            });
            mockUserRepo.save.mockResolvedValue({});
            mockUserRoleRepo.find.mockResolvedValue([]);

            const result = await service.validateEntraToken('entra-jwt', 'app-1');

            expect(result.valid).toBe(true);
            expect(result.oid).toBe('azure-oid-1');
            expect(result.email).toBe('user@corp.com');
            expect(result.userId).toBe('user-1');
            expect(result.permissions).toEqual([]);
        });

        it('should throw UnauthorizedException when Entra token is invalid', async () => {
            mockEntraIdService.validate.mockRejectedValue(new Error('Invalid signature'));

            await expect(service.validateEntraToken('bad-token')).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });

    // ═══════════════ syncEntraUser ═══════════════════════════════════

    describe('syncEntraUser', () => {
        it('should create new user when not found by oid or email', async () => {
            mockUserRepo.findOne.mockResolvedValue(null); // not found by oid nor email
            const newUser = {
                id: 'new-user-1',
                email: 'new@corp.com',
                entraId: 'oid-new',
                lastLoginAt: null,
            };
            mockUserRepo.create.mockReturnValue(newUser);
            mockUserRepo.save.mockResolvedValue(newUser);
            mockUserRoleRepo.find.mockResolvedValue([]);

            const result = await service.syncEntraUser('oid-new', 'new@corp.com', 'New User');

            expect(mockUserRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'new@corp.com',
                    entraId: 'oid-new',
                    accountType: 'user',
                }),
            );
            expect(result.userId).toBe('new-user-1');
        });

        it('should associate oid to existing user matched by email', async () => {
            // First findOne (by oid) → null
            mockUserRepo.findOne
                .mockResolvedValueOnce(null)
                // Second findOne (by email) → existing user without entraId
                .mockResolvedValueOnce({
                    id: 'existing-1',
                    email: 'user@corp.com',
                    entraId: null,
                    lastLoginAt: null,
                });
            mockUserRepo.save.mockResolvedValue({});
            mockUserRoleRepo.find.mockResolvedValue([]);

            const result = await service.syncEntraUser('oid-1', 'user@corp.com');

            expect(result.userId).toBe('existing-1');
        });

        it('should throw ConflictException if email already linked to different oid', async () => {
            mockUserRepo.findOne
                .mockResolvedValueOnce(null) // by oid
                .mockResolvedValueOnce({
                    id: 'existing-1',
                    email: 'user@corp.com',
                    entraId: 'different-oid',
                    isActive: true,
                    lastLoginAt: null,
                });

            await expect(
                service.syncEntraUser('new-oid', 'user@corp.com'),
            ).rejects.toThrow(ConflictException);
        });

        it('should handle race condition (ER_DUP_ENTRY) gracefully', async () => {
            mockUserRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
            mockUserRepo.create.mockReturnValue({
                id: 'race-user',
                email: 'race@corp.com',
                entraId: 'oid-race',
                lastLoginAt: null,
            });
            // save throws duplicate
            const dupError: any = new Error('Duplicate entry');
            dupError.code = 'ER_DUP_ENTRY';
            dupError.errno = 1062;
            mockUserRepo.save.mockRejectedValueOnce(dupError);
            // Recovery findOne
            mockUserRepo.findOne.mockResolvedValueOnce({
                id: 'winner-user',
                email: 'race@corp.com',
                entraId: 'oid-race',
            });
            mockUserRoleRepo.find.mockResolvedValue([]);

            const result = await service.syncEntraUser('oid-race', 'race@corp.com');
            expect(result.userId).toBe('winner-user');
        });

        it('should load permissions from roles', async () => {
            mockUserRepo.findOne.mockResolvedValue({
                id: 'user-1',
                entraId: 'oid-1',
                email: 'user@corp.com',
                lastLoginAt: null,
            });
            mockUserRepo.save.mockResolvedValue({});

            mockUserRoleRepo.find.mockResolvedValue([
                { role: { id: 'role-1' } },
                { role: { id: 'role-2' } },
            ]);

            mockRolePermRepo.find.mockResolvedValue([
                { permission: { resource: 'incident', action: 'create' } },
                { permission: { resource: 'incident', action: 'read' } },
            ]);

            const result = await service.syncEntraUser('oid-1', 'user@corp.com', undefined, 'app-1');

            expect(result.permissions).toEqual(['incident:create', 'incident:read']);
        });
    });

    // ═══════════════ generateServiceToken ════════════════════════════════

    describe('generateServiceToken', () => {
        const serviceOwner: Partial<User> = {
            id: 'svc-user-1',
            accountType: 'service' as any,
        };

        const serviceApp: Partial<Application> = {
            id: 'app-1',
            name: 'monolith',
            apiKey: 'ak_test123',
            apiSecret: '$2a$12$hashedsecret',
            isActive: true,
            owner: serviceOwner as User,
            type: 'internal' as any,
            usageLimit: null as any,
            expiresAt: null as any,
        };

        beforeEach(() => {
            mockAppRepo.findOne.mockResolvedValue(serviceApp);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            jest.spyOn(JwtEd25519Service, 'signWithKey').mockReturnValue('m2m-jwt-mock');
            process.env.ED25519_PRIVATE_KEY = 'test-ed25519-private-key';
            mockUserRoleRepo.find.mockResolvedValue([{ role: { id: 'role-1' } }]);
            mockRolePermRepo.find.mockResolvedValue([
                { permission: { resource: 'incident', action: 'create' } },
            ]);
        });

        afterEach(() => {
            delete process.env.ED25519_PRIVATE_KEY;
        });

        it('should generate M2M token', async () => {
            const result = await service.generateServiceToken('ak_test123', 'raw-secret');

            expect(result.isSuccess).toBe(true);
            const data = result.unwrap();
            expect(data.accessToken).toBe('m2m-jwt-mock');
            expect(data.tokenType).toBe('Bearer');
            expect(data.expiresIn).toBe(3600);
        });

        it('should fail with invalid apiKey', async () => {
            mockAppRepo.findOne.mockResolvedValue(null);

            const result = await service.generateServiceToken('bad-key', 'secret');

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Credenciales de API inválidas');
        });

        it('should fail with invalid apiSecret', async () => {
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

            const result = await service.generateServiceToken('ak_test123', 'wrong-secret');

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Credenciales de API inválidas');
        });

        it('should fail when owner is not a service account', async () => {
            mockAppRepo.findOne.mockResolvedValue({
                ...serviceApp,
                owner: { ...serviceOwner, accountType: 'user' },
            });

            const result = await service.generateServiceToken('ak_test123', 'secret');

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe(
                'La aplicación no está configurada como cuenta de servicio',
            );
        });

        it('should fail when credentials are expired', async () => {
            mockAppRepo.findOne.mockResolvedValue({
                ...serviceApp,
                expiresAt: new Date('2020-01-01'),
            });

            const result = await service.generateServiceToken('ak_test123', 'secret');

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Credenciales de API expiradas');
        });

        it('should reject oauth_client apps trying M2M endpoint', async () => {
            mockAppRepo.findOne.mockResolvedValue({
                ...serviceApp,
                type: 'oauth_client',
            });

            const result = await service.generateServiceToken('ak_test123', 'secret');

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toContain('OAuth');
        });

        it('should fail when usage limit is exceeded (atomic check)', async () => {
            mockAppRepo.findOne.mockResolvedValue({
                ...serviceApp,
                usageLimit: 100,
            });

            // Simulate atomic update returning affected = 0 (limit reached)
            mockAppRepo.createQueryBuilder.mockReturnValue({
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 0 }),
            });

            const result = await service.generateServiceToken('ak_test123', 'secret');

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('Límite de uso de API alcanzado');
        });
    });

    // ═══════════════ generateOAuthToken ══════════════════════════════

    describe('generateOAuthToken', () => {
        const oauthOwner: Partial<User> = {
            id: 'svc-oauth-1',
            accountType: 'service' as any,
        };

        const oauthApp: Partial<Application> = {
            id: 'oauth-app-1',
            name: 'external-app',
            apiKey: 'client-id-123',
            apiSecret: '$2a$12$hashedsecret',
            isActive: true,
            owner: oauthOwner as User,
            type: 'oauth_client' as any,
            scopes: ['incident:read', 'request:read'],
            usageLimit: null as any,
            expiresAt: null as any,
        };

        it('should generate OAuth token with scoped permissions', async () => {
            mockOauthService.generateToken.mockResolvedValue(Result.ok({
                access_token: 'jwt-token-mock',
                token_type: 'Bearer',
                expires_in: 3600,
                scope: 'incident:read',
            }));

            const result = await service.generateOAuthToken(
                'client-id-123',
                'client-secret',
                'incident:read',
            );

            expect(result.isSuccess).toBe(true);
            const data = result.unwrap();
            expect(data.access_token).toBe('jwt-token-mock');
            expect(data.token_type).toBe('Bearer');
            expect(data.scope).toBe('incident:read');
        });

        it('should grant all allowed scopes when no scope requested', async () => {
            mockOauthService.generateToken.mockResolvedValue(Result.ok({
                access_token: 'jwt-token-mock',
                token_type: 'Bearer',
                expires_in: 3600,
                scope: 'incident:read request:read',
            }));

            const result = await service.generateOAuthToken('client-id-123', 'secret');

            expect(result.isSuccess).toBe(true);
            const data = result.unwrap();
            expect(data.scope).toBe('incident:read request:read');
        });

        it('should reject invalid scopes', async () => {
            mockOauthService.generateToken.mockResolvedValue(Result.err('invalid_scope'));

            const result = await service.generateOAuthToken(
                'client-id-123',
                'secret',
                'incident:delete',
            );

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('invalid_scope');
        });

        it('should reject non-oauth_client apps', async () => {
            mockOauthService.generateToken.mockResolvedValue(Result.err('invalid_client'));

            const result = await service.generateOAuthToken('client-id-123', 'secret');

            expect(result.isFailure).toBe(true);
            expect(result.unwrapError()).toBe('invalid_client');
        });
    });

    // ═══════════════ validateApiKey ══════════════════════════════════

    describe('validateApiKey', () => {
        it('should return application info with permissions on valid credentials', async () => {
            mockAppRepo.findOne.mockResolvedValue({
                id: 'app-1',
                name: 'test-app',
                apiKey: 'ak_test',
                apiSecret: '$2a$12$hashed',
                isActive: true,
                owner: { id: 'svc-1', accountType: 'service' },
                usageLimit: null,
                expiresAt: null,
            });
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
            mockUserRoleRepo.find.mockResolvedValue([]);

            const result = await service.validateApiKey('ak_test', 'secret');

            expect(result.valid).toBe(true);
            expect(result.applicationId).toBe('app-1');
            expect(result.applicationName).toBe('test-app');
        });

        it('should throw UnauthorizedException on invalid credentials', async () => {
            mockAppRepo.findOne.mockResolvedValue(null);

            await expect(service.validateApiKey('bad', 'bad')).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });
});
