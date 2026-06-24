import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { Application, RolePermission, User, UserRole } from 'src/entities';
import { LoggerService } from '../../observability';
import { Result } from 'src/common/result/result';

export interface OAuthTokenResult {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    scope: string;
}

/**
 * OAuth 2.0 Client Credentials flow (RFC 6749) — para apps externas.
 *
 * Usa columnas propias de la entidad Application:
 *   - clientId     (public identifier, prefijo 'cid_')
 *   - clientSecret (hash bcrypt, prefijo 'csec_')
 *
 * Estas columnas son distintas de apiKey/apiSecret, que pertenecen
 * al flow de integraciones ad-hoc (POST /auth/service-token).
 *
 * Scopes:
 *   Los scopes de un OAuth client son la allow-list configurada en application.scopes.
 *   El token resultante solo lleva los permisos que sean intersección de:
 *     - permisos del owner (service account)
 *     - scopes permitidos del client
 *     - scopes solicitados en el request (si se envían)
 */
@Injectable()
export class OauthService {
    constructor(
        @InjectRepository(Application) private applicationRepository: Repository<Application>,
        @InjectRepository(UserRole) private userRoleRepository: Repository<UserRole>,
        @InjectRepository(RolePermission) private rolePermissionRepository: Repository<RolePermission>,
        private jwtService: JwtService,
        private logger: LoggerService,
    ) { }

    /**
     * Valida las credenciales del OAuth client y emite un access_token RFC 6749.
     *
     * Errores posibles (usados como error_description en la respuesta HTTP):
     *   'invalid_client' — clientId/clientSecret inválidos, app inactiva, expirada o mal configurada
     *   'invalid_scope'  — uno o más scopes solicitados no están en el allow-list del client
     */
    async generateToken(
        clientId: string,
        clientSecret: string,
        requestedScope?: string,
    ): Promise<Result<OAuthTokenResult, string>> {
        // 1. Validar credenciales
        const validation = await this.validateClientCredentials(clientId, clientSecret);
        if (validation.isFailure) {
            return Result.err(validation.unwrapError());
        }

        const { application, owner, permissions } = validation.unwrap();

        // 2. Calcular scopes concedidos
        //    - application.scopes = null  → sin restricción, usar todos los permisos del owner
        //    - application.scopes = []    → ningún scope permitido
        //    - application.scopes = [..] → allow-list
        const allowedScopes: string[] = application.scopes?.length ? application.scopes : permissions;
        let grantedScopes: string[];

        if (requestedScope) {
            const requested = requestedScope.split(' ').filter(Boolean);
            const invalid = requested.filter(s => !allowedScopes.includes(s));
            if (invalid.length > 0) {
                return Result.err('invalid_scope');
            }
            grantedScopes = requested;
        } else {
            grantedScopes = allowedScopes;
        }

        // 3. Filtrar permisos del owner a los scopes concedidos
        const scopedPermissions = permissions.filter(p => grantedScopes.includes(p));

        // 4. Emitir JWT
        const payload = {
            sub: owner.id,
            type: 'service',
            applicationId: application.id,
            applicationName: application.name,
            permissions: scopedPermissions,
            scope: grantedScopes.join(' '),
            accountType: 'service',
        };

        const token = this.jwtService.sign(payload, { expiresIn: '1h' });

        this.logger.log(`OAuth token emitido para ${application.name}`, 'OAUTH', {
            applicationId: application.id,
            ownerId: owner.id,
            grantedScopes,
            permissionsCount: scopedPermissions.length,
        });

        return Result.ok({
            access_token: token,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: grantedScopes.join(' '),
        });
    }

    /**
     * Valida clientId + clientSecret contra la columna dedicada de OAuth clients.
     * No toca apiKey/apiSecret — esas columnas son exclusivas del flow M2M.
     */
    private async validateClientCredentials(
        clientId: string,
        clientSecret: string,
    ): Promise<Result<{ application: Application; owner: User; permissions: string[] }, string>> {
        // 1. Buscar por clientId (columna exclusiva de oauth_client)
        const application = await this.applicationRepository.findOne({
            where: { clientId, isActive: true },
            relations: ['owner'],
        });

        if (!application || application.type !== 'oauth_client') {
            return Result.err('invalid_client');
        }

        // 2. Verificar clientSecret
        if (!application.clientSecret) {
            return Result.err('invalid_client');
        }
        const isValid = await bcrypt.compare(clientSecret, application.clientSecret);
        if (!isValid) {
            return Result.err('invalid_client');
        }

        // 3. Verificar expiración de credenciales
        if (application.expiresAt && application.expiresAt < new Date()) {
            return Result.err('invalid_client');
        }

        // 4. Verificar que el owner es una cuenta de servicio
        const owner = application.owner;
        if (!owner || owner.accountType !== 'service') {
            return Result.err('invalid_client');
        }

        // 5. Cargar permisos del owner (vía roles)
        const userRoles = await this.userRoleRepository.find({
            where: { userId: owner.id, isActive: true },
            relations: ['role'],
        });
        const roleIds = userRoles.map(ur => ur.role?.id).filter(Boolean);

        let permissions: string[] = [];
        if (roleIds.length > 0) {
            const rolePermissions = await this.rolePermissionRepository.find({
                where: { roleId: In(roleIds) },
                relations: ['permission'],
            });
            permissions = rolePermissions
                .map(rp => rp.permission)
                .filter(Boolean)
                .map(p => `${p.resource}:${p.action}`);
        }

        return Result.ok({ application, owner, permissions });
    }
}
