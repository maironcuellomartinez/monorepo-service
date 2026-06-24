/**
 * @description
 * Module for ABAC (Attribute-Based Access Control)
 * @returns {Module} AbacModule
 * @version 1.0.0
 * @author Mairon Cuello
 * @license MIT
 * @copyright 2025 Mairon Cuello
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbacService } from './services/abac.service';
import {
    Application,
    AuditLog,
    Permission,
    Policy,
    PolicyPermission,
    PolicyRule,
    Role,
    RolePermission,
    User,
    UserApplication,
    UserRole
} from '../entities';
import { UserController } from './controllers/user.controller';
import { UserPolicyController } from './controllers/user-policy.controller';
import { ApplicationService } from './services/application.service';
import { CacheLocalModule, CacheService } from 'src/cache';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PermissionService } from './services/permission.service';
import { PermissionController } from './controllers/permission.controller';
import { AbacController } from './controllers/abac.controller';
import { AuditService } from './services';
import { PolicyController } from './controllers/policy.controller';
import { RoleController } from './controllers/role.controller';
import { ApplicationController } from './controllers/application.controller';
import { AuthController } from './controllers/auth.controller';
import { AuditController } from './controllers/audit.controller';
import { PolicyService } from './services/policy.service';
import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';
import { UserPolicyService } from './services/user-policy.service';
import { UserPolicyAssignment } from 'src/entities/userPolicyAssignment.entity';
import { AbacMetricsService } from './services/abac-metrics.service';
import { EntraIdService } from './services/entra-id.service';
import { OauthService } from './services/oauth.service';

/**
 * @description
 * Module for ABAC (Attribute-Based Access Control)
 * @returns {Module} AbacModule
 * @version 1.0.0
 * @author Mairon Cuello
 * @license MIT
 * @copyright 2025 Mairon Cuello
 */
@Module({
    imports: [
        CacheLocalModule,
        TypeOrmModule.forFeature([
            User,
            UserApplication,
            Application,
            Role,
            AuditLog,
            Permission,
            Policy,
            PolicyRule,
            RolePermission,
            PolicyPermission,
            UserRole,
            UserPolicyAssignment
        ]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => {
                const secret = configService.get<string>('JWT_SECRET');
                if (!secret) {
                    throw new Error('JWT_SECRET no configurado — revisa el archivo .env');
                }
                return {
                    secret,
                    signOptions: {
                        expiresIn: '1h',
                        issuer: configService.get<string>('JWT_ISSUER') || 'abac-service',
                        audience: configService.get<string>('JWT_AUDIENCE') || 'abac-clients',
                    },
                };
            },
            inject: [ConfigService],
        }),
    ],
    providers: [
        AbacService,
        AbacMetricsService,
        UserService,
        UserPolicyService,
        ApplicationService,
        PermissionService,
        AuditService,
        ApiKeyGuard,
        PolicyService,
        AuthService,
        CacheService,
        EntraIdService,
        OauthService,
    ],
    controllers: [
        AbacController,
        UserController,
        UserPolicyController,
        PermissionController,
        PolicyController,
        RoleController,
        ApplicationController,
        AuthController,
        AuditController
    ],
    exports: [AbacService, UserService, UserPolicyService, PermissionService],
})
export class AbacModule { }
