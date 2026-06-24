import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AbacClient } from './abac.client';
import { JwtGuard } from './guards/jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { AbacGuard } from './guards/abac.guard';

/**
 * Los HTTP clients de ABAC (tokens ABAC_HTTP / ABAC_HTTP_NOCB) se registran
 * de forma global en HttpClientsModule.
 */
@Module({
    providers: [
        AbacClient,
        // Guards globales: orden → JwtGuard → RolesGuard → AbacGuard
        { provide: APP_GUARD, useClass: JwtGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: AbacGuard },
    ],
    exports: [AbacClient],
})
export class AuthModule {}
