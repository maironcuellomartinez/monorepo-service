// src/auth/auth.service.ts

import { Injectable, UnauthorizedException, ConflictException, NotFoundException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtEd25519Service } from '../../common/crypto/jwt-ed25519.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { Application, RolePermission, User, UserApplication, UserRole } from 'src/entities';
// Note: Application, RolePermission, UserRole se mantienen para el flow M2M (validateApplicationCredentials)
import { LoggerService } from '../../observability';
import { Result } from 'src/common/result/result';
import { EntraIdService } from './entra-id.service';
import { OauthService } from './oauth.service';
import { AuditService } from './audit.service';
import { AuditAction, EntityType } from 'src/entities';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User) private userRepository: Repository<User>,
        @InjectRepository(Application) private applicationRepository: Repository<Application>,
        @InjectRepository(RolePermission) private rolePermissionRepository: Repository<RolePermission>,
        @InjectRepository(UserRole) private userRoleRepository: Repository<UserRole>,
        @InjectRepository(UserApplication) private userApplicationRepository: Repository<UserApplication>,
        private jwtService: JwtService,
        private logger: LoggerService,
        private auditService: AuditService,
        private entraIdService: EntraIdService,
        private oauthService: OauthService,
    ) { }

    // ==================== ADMIN LOGIN ====================

    /**
     * Login para usuarios administradores (email + password).
     * Valida credenciales, verifica que el usuario tenga rol admin/super-admin
     * en la aplicación, y retorna un JWT con roles y permisos.
     */
    async adminLogin(email: string, password: string, applicationId?: string): Promise<Result<any, string>> {
        // 1. Buscar usuario por email
        const user = await this.userRepository.findOne({ where: { email, isActive: true } });

        if (!user || !user.passwordHash) {
            this.auditService.logEvent(AuditAction.LOGIN_FAILED, {
                userEmail: email,
                isSuccess: false,
                description: `Login fallido: usuario no encontrado (${email})`,
            }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`, 'AUTH'); });
            return Result.err('Credenciales inválidas');
        }

        // 2. Bloquear login local para usuarios de Entra ID — deben autenticarse via Azure
        if (user.entraId) {
            this.auditService.logEvent(AuditAction.LOGIN_FAILED, {
                userId: user.id,
                userEmail: email,
                isSuccess: false,
                description: `Login local bloqueado: ${email} es usuario de Entra ID`,
            }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`, 'AUTH'); });
            return Result.err('Credenciales inválidas');
        }

        // 3. Verificar password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            this.auditService.logEvent(AuditAction.LOGIN_FAILED, {
                userId: user.id,
                userEmail: user.email,
                isSuccess: false,
                description: `Login fallido: contraseña incorrecta para ${email}`,
            }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`, 'AUTH'); });
            return Result.err('Credenciales inválidas');
        }

        // 3. Resolver applicationId: param → env → primera app del usuario
        let appId = applicationId || process.env.ABAC_APP_ID || '';
        if (!appId) {
            const ua = await this.userApplicationRepository.findOne({
                where: { userId: user.id, isActive: true },
                order: { createdAt: 'ASC' },
            });
            appId = ua?.applicationId || '';
        }

        if (!appId) {
            return Result.err('El usuario no está vinculado a ninguna aplicación');
        }

        // 4. Cargar roles del usuario para esta aplicación
        const userRoles = await this.userRoleRepository.find({
            where: { userId: user.id, isActive: true, applicationId: appId },
            relations: ['role'],
        });

        const roleNames = userRoles.map(ur => ur.role?.name).filter(Boolean);

        // 5. Verificar que tiene rol admin o super-admin
        const isAdmin = roleNames.some(r => r === 'admin' || r === 'super-admin');
        if (!isAdmin) {
            return Result.err('Acceso denegado — se requiere rol de administrador');
        }

        // 6. Cargar permisos (solo effect: 'allow' — los deny no otorgan acceso)
        const roleIds = userRoles.map(ur => ur.role?.id).filter(Boolean);
        let permissions: string[] = [];
        if (roleIds.length > 0) {
            const rolePermissions = await this.rolePermissionRepository.find({
                where: { roleId: In(roleIds), effect: 'allow', isActive: true },
                relations: ['permission'],
            });
            permissions = rolePermissions
                .map(rp => rp.permission)
                .filter(Boolean)
                .map(p => `${p.resource}:${p.action}`);
        }

        // 7. Actualizar lastLoginAt
        user.lastLoginAt = new Date();
        await this.userRepository.save(user);

        // 8. Generar JWT
        const payload = {
            sub: user.id,
            email: user.email,
            type: 'admin',
            accountType: user.accountType,
            appId,
            roles: roleNames,
            permissions,
        };

        const token = this.jwtService.sign(payload, { expiresIn: '8h' });

        this.logger.log(`Admin login: ${email}`, 'AUTH', {
            userId: user.id,
            roles: roleNames,
            permissionsCount: permissions.length,
        });

        this.auditService.logEvent(AuditAction.LOGIN, {
            userId: user.id,
            userEmail: user.email,
            applicationId: appId,
            entityType: EntityType.USER,
            entityId: user.id,
            isSuccess: true,
            description: `Login exitoso: ${email} (roles: ${roleNames.join(', ')})`,
        }).catch((err: unknown) => { this.logger.warn(`Audit log failed: ${(err as Error).message}`, 'AUTH'); });

        return Result.ok({
            accessToken: token,
            tokenType: 'Bearer',
            expiresIn: 28800, // 8h
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                roles: roleNames,
            },
            permissions,
        });
    }

    // ==================== VALIDACIÓN DE TOKEN ====================

    /**
     * Valida un JWT y retorna su payload (stateless, sin consulta a BD)
     */
    async validateToken(token: string): Promise<any> {
        try {
            const payload = this.jwtService.verify(token);
            return {
                userId: payload.sub,
                email: payload.email,
                expiresAt: new Date(payload.exp * 1000),
            };
        } catch (error) {
            this.logger.warn(`Token inválido: ${(error as Error).message}`, 'AUTH');
            throw new UnauthorizedException('Token inválido o expirado');
        }
    }

    // ==================== ENTRA ID ====================

    /**
     * Valida un token de Entra ID (Azure AD) y sincroniza el usuario en ABAC.
     * Centraliza la validación JWKS — el gateway llama aquí en vez de validar localmente.
     * Retorna el userId interno + permisos para que el gateway construya request.user.
     */
    async validateEntraToken(
        token: string,
        applicationId?: string,
    ): Promise<{ valid: boolean; oid: string; email: string; userId: string; firstName: string; lastName: string; permissions: string[] }> {
        // 1. Validar firma JWKS
        let entraPayload: { oid: string; email: string; name?: string };

        // DEV BYPASS — solo cuando Entra ID no está configurado (sin Azure real)
        // Acepta tokens con formato: "dev:<base64url-json>"
        // Ejemplo: dev:<base64url({"oid":"dev-001","email":"user@test.com","name":"Test User"})>
        if (!this.entraIdService.isEnabled && process.env.NODE_ENV === 'development' && token.startsWith('dev:')) {
            try {
                entraPayload = JSON.parse(Buffer.from(token.slice(4), 'base64url').toString('utf8'));
                if (!entraPayload.oid || !entraPayload.email) throw new Error('Faltan oid o email');
                this.logger.warn(`[DEV] Bypass Entra ID — oid=${entraPayload.oid} email=${entraPayload.email}`, 'AUTH');
            } catch (e) {
                throw new UnauthorizedException(`Dev token inválido: ${(e as Error).message}`);
            }
        } else {
            try {
                entraPayload = await this.entraIdService.validate(token);
            } catch (error) {
                // Propagar tal cual: EntraIdService ya distingue infra caída (503) de token inválido (401)
                if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) {
                    this.logger.warn(`Entra ID validate() falló: ${(error as Error).message}`, 'AUTH');
                    throw error;
                }
                this.logger.error(`Entra ID token inválido: ${(error as Error).message}`, 'AUTH');
                throw new UnauthorizedException('Token de Entra ID inválido o expirado');
            }
        }

        // 2. Lazy sync — reutiliza el método existente
        const sync = await this.syncEntraUser(
            entraPayload.oid,
            entraPayload.email,
            entraPayload.name,
            applicationId,
        );

        // DEV FALLBACK — si el sync no resolvió permisos (applicationId mismatch entre
        // lo que el seed grabó y lo que está en .env), cargar roles sin filtro de app.
        let permissions = sync.permissions;
        if (permissions.length === 0 && !this.entraIdService.isEnabled && process.env.NODE_ENV === 'development') {
            this.logger.warn(`[DEV] permisos=0 con appId=${applicationId} — intentando carga sin filtro de app`, 'AUTH');
            const allRoles = await this.userRoleRepository.find({
                where: { userId: sync.userId, isActive: true },
                relations: ['role'],
            });
            const roleIds = allRoles.map(ur => ur.role?.id).filter(Boolean);
            if (roleIds.length > 0) {
                const rolePerms = await this.rolePermissionRepository.find({
                    where: { roleId: In(roleIds), effect: 'allow', isActive: true },
                    relations: ['permission'],
                });
                permissions = rolePerms
                    .map(rp => rp.permission)
                    .filter(Boolean)
                    .map(p => `${p.resource}:${p.action}`);
                this.logger.warn(`[DEV] Permisos cargados sin filtro de app: ${permissions.length}`, 'AUTH');
            }
        }

        return {
            valid: true,
            oid: entraPayload.oid,
            email: entraPayload.email,
            userId: sync.userId,
            firstName: sync.firstName,
            lastName: sync.lastName,
            permissions,
        };
    }

    /**
     * Lazy sync de usuario de Entra ID (Azure AD).
     * Llamado por api-gateway cada vez que llega un token de Entra ID.
     * - Si el user no existe → se crea con accountType='user', sin passwordHash
     * - Si existe → actualiza email y lastLoginAt
     * - Carga roles y permisos del usuario en esta aplicación
     * - Retorna userId + array de permisos ['resource:action', ...]
     */
    async syncEntraUser(
        oid: string,
        email: string,
        displayName?: string,
        applicationId?: string,
    ): Promise<{ userId: string; firstName: string; lastName: string; permissions: string[] }> {
        const appId = applicationId ?? process.env.ABAC_APP_ID ?? '';

        // 1. Buscar o crear usuario por entraId (oid)
        let user = await this.userRepository.findOne({ where: { entraId: oid } });
        if (!user) {
            // Puede existir un user con mismo email (creado manualmente) — asociar oid
            user = await this.userRepository.findOne({ where: { email, isActive: true } });

            if (user) {
                // Si el usuario ya tiene un entraId diferente, no sobreescribir (posible conflicto de tenants)
                if (user.entraId && user.entraId !== oid) {
                    this.logger.warn(`Conflicto entraId: email=${email} ya tiene oid=${user.entraId}, nuevo oid=${oid}`, 'AUTH');
                    throw new ConflictException('El email ya está asociado a otra identidad de Entra ID');
                }
                user.entraId = oid;
                // Invalidar credencial local — a partir de ahora solo puede autenticarse via Entra ID
                user.passwordHash = null;
            } else {
                // Crear nuevo usuario de Entra ID
                const nameParts = (displayName ?? email).split(' ');
                user = this.userRepository.create({
                    email,
                    entraId: oid,
                    firstName: nameParts[0] ?? email,
                    lastName: nameParts.slice(1).join(' ') || '-',
                    username: email.split('@')[0],
                    passwordHash: null,
                    status: 'active',
                    accountType: 'user',
                    isActive: true,
                });
            }
        }

        user.lastLoginAt = new Date();
        try {
            await this.userRepository.save(user);
        } catch (error: any) {
            // race condition handled below
            // Race condition: otro request creó el usuario entre findOne y save.
            // Recuperar el usuario ya creado en vez de fallar.
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                this.logger.warn(`Duplicate key en syncEntraUser, recuperando usuario existente: ${email}`, 'AUTH');
                user = await this.userRepository.findOne({ where: [{ entraId: oid }, { email }] });
                if (!user) throw error;
            } else {
                throw error;
            }
        }

        // 2. Upsert UserApplication — garantiza que el usuario tiene membresía en la app
        if (appId) {
            const existingUa = await this.userApplicationRepository.findOne({
                where: { userId: user.id, applicationId: appId },
            });
            if (!existingUa) {
                const ua = this.userApplicationRepository.create({
                    userId: user.id,
                    applicationId: appId,
                    membershipType: 'member',
                    isActive: true,
                });
                try {
                    await this.userApplicationRepository.save(ua);
                    this.logger.log(`UserApplication creado: userId=${user.id} appId=${appId}`, 'AUTH');
                } catch (error: any) {
                    // Race condition esperada: otro request ya creó la misma membresía.
                    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                        this.logger.warn(`Duplicate key en UserApplication, ya existe: userId=${user.id} appId=${appId}`, 'AUTH');
                    } else {
                        this.logger.error(`Error creando UserApplication: userId=${user.id} appId=${appId} — ${error.message}`, 'AUTH');
                        throw error;
                    }
                }
            } else if (!existingUa.isActive) {
                existingUa.isActive = true;
                await this.userApplicationRepository.save(existingUa);
            }
        }

        // 3. Cargar roles del usuario para esta aplicación
        const userRoles = await this.userRoleRepository.find({
            where: { userId: user.id, isActive: true, ...(appId ? { applicationId: appId } : {}) },
            relations: ['role'],
        });

        const roleIds = userRoles.map(ur => ur.role?.id).filter(Boolean);

        // 3. Cargar permisos de los roles (solo effect: 'allow' — los deny no otorgan acceso)
        let permissions: string[] = [];
        if (roleIds.length > 0) {
            const rolePermissions = await this.rolePermissionRepository.find({
                where: { roleId: In(roleIds), effect: 'allow', isActive: true },
                relations: ['permission'],
            });
            permissions = rolePermissions
                .map(rp => rp.permission)
                .filter(Boolean)
                .map(p => `${p.resource}:${p.action}`);
        }

        this.logger.log(`Entra sync OK: ${email} (${oid}) → userId=${user.id} permisos=${permissions.length}`, 'AUTH');

        return { userId: user.id, firstName: user.firstName ?? '', lastName: user.lastName ?? '', permissions };
    }

    /**
     * Valida credenciales M2M (apiKey + apiSecret) — solo para apps type='internal'.
     * Usado por POST /auth/m2m-token y ApiKeyGuard.
     */
    private async validateApplicationCredentials(
        apiKey: string,
        apiSecret: string,
    ): Promise<Result<{ application: Application; owner: User }, string>> {
        // 1. Buscar Application por apiKey (columna exclusiva de apps internas)
        const application = await this.applicationRepository.findOne({
            where: { apiKey, isActive: true },
            relations: ['owner'],
        });

        if (!application) {
            return Result.err('Credenciales de API inválidas');
        }

        // 2. Verificar apiSecret
        if (!application.apiSecret) {
            return Result.err('Credenciales de API inválidas');
        }
        const isSecretValid = await bcrypt.compare(apiSecret, application.apiSecret);
        if (!isSecretValid) {
            return Result.err('Credenciales de API inválidas');
        }

        // 3. Verificar expiración
        if (application.expiresAt && application.expiresAt < new Date()) {
            return Result.err('Credenciales de API expiradas');
        }

        // 4. Verificar que el owner es cuenta de servicio
        const owner = application.owner;
        if (!owner || owner.accountType !== 'service') {
            return Result.err('La aplicación no está configurada como cuenta de servicio');
        }

        // 5. Incrementar y verificar límite de uso atómicamente
        if (application.usageLimit) {
            const result = await this.applicationRepository
                .createQueryBuilder()
                .update()
                .set({ usageCount: () => 'usageCount + 1' })
                .where('id = :id AND (usageLimit IS NULL OR usageCount < usageLimit)', { id: application.id })
                .execute();

            if (result.affected === 0) {
                return Result.err('Límite de uso de API alcanzado');
            }
        } else {
            await this.applicationRepository.increment({ id: application.id }, 'usageCount', 1);
        }

        return Result.ok({ application, owner });
    }

    /**
     * M2M Token — para service-to-service auth (sin sesión Redis).
     * Valida apiKey + apiSecret de la Application, carga los permisos del
     * owner (cuenta de servicio), y genera un JWT de corta duración (1h).
     */
    async generateServiceToken(apiKey: string, apiSecret: string): Promise<Result<any, string>> {
        const validation = await this.validateApplicationCredentials(apiKey, apiSecret);
        if (validation.isFailure) {
            return Result.err(validation.unwrapError());
        }

        const { application, owner } = validation.unwrap();

        // M2M solo para apps internas — OAuth clients deben usar POST /auth/oauth/token
        if (application.type === 'oauth_client') {
            return Result.err('Las aplicaciones OAuth deben usar el endpoint /auth/oauth/token');
        }

        const privateKey = process.env.ED25519_PRIVATE_KEY;
        if (!privateKey) {
            this.logger.error('ED25519_PRIVATE_KEY no configurado — no se puede emitir token M2M', 'AUTH');
            throw new InternalServerErrorException('ED25519_PRIVATE_KEY no configurado — requerido para emitir tokens M2M');
        }

        const payload = {
            sub: owner.id,
            type: 'service',
            applicationId: application.id,
            applicationName: application.name,
            accountType: 'service',
            iss: process.env.JWT_ISSUER ?? 'abac-service',
            aud: process.env.JWT_AUDIENCE ?? 'abac-clients',
        };

        const token = JwtEd25519Service.signWithKey(
            privateKey,
            { payload, expiresIn: 3600 },
            { kid: process.env.ED25519_KID },
        );

        this.logger.log(`M2M token emitido para ${application.name}`, 'AUTH', {
            applicationId: application.id,
            ownerId: owner.id,
        });

        return Result.ok({
            accessToken: token,
            tokenType: 'Bearer',
            expiresIn: 3600,
            applicationId: application.id,
            applicationName: application.name,
        });
    }

    /**
     * OAuth 2.0 Client Credentials — delegado a OauthService.
     */
    async generateOAuthToken(
        clientId: string,
        clientSecret: string,
        requestedScope?: string,
    ): Promise<Result<any, string>> {
        return this.oauthService.generateToken(clientId, clientSecret, requestedScope);
    }

    async validateApiKey(apiKey: string, apiSecret: string): Promise<any> {
        const validation = await this.validateApplicationCredentials(apiKey, apiSecret);
        if (validation.isFailure) {
            throw new UnauthorizedException(validation.unwrapError());
        }

        const { application, owner } = validation.unwrap();

        return {
            valid: true,
            applicationId: application.id,
            applicationName: application.name,
            ownerId: owner.id,
        };
    }
}