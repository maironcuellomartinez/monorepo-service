import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AbacClient } from '../abac.client';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { IS_INTERNAL } from '../decorators/internal.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

interface CacheEntry {
    roles: string[];
    expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 segundos

@Injectable()
export class RolesGuard implements CanActivate {
    private readonly logger = new Logger(RolesGuard.name);
    private readonly cache = new Map<string, CacheEntry>();

    constructor(
        private readonly abac: AbacClient,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const handlers = [ctx.getHandler(), ctx.getClass()];

        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, handlers)) return true;
        if (this.reflector.getAllAndOverride<boolean>(IS_INTERNAL, handlers)) return true;

        // Si el endpoint no tiene @Roles(), se permite
        const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, handlers);
        if (!requiredRoles?.length) return true;

        const request = ctx.switchToHttp().getRequest<Request>();
        const user    = (request as any).user as JwtPayload | undefined;

        if (!user?.sub) {
            throw new ForbiddenException('Usuario no autenticado');
        }

        const userRoles = await this.getRoles(user.sub);
        const hasRole   = requiredRoles.some(r => userRoles.includes(r));

        if (!hasRole) {
            this.logger.warn(
                `Roles insuficientes: user=${user.sub} tiene [${userRoles}], requiere [${requiredRoles}]`,
            );
            throw new ForbiddenException(
                `Se requiere uno de los siguientes roles: ${requiredRoles.join(', ')}`,
            );
        }

        return true;
    }

    private async getRoles(userId: string): Promise<string[]> {
        const now   = Date.now();
        const entry = this.cache.get(userId);

        if (entry && entry.expiresAt > now) {
            return entry.roles;
        }

        const roles = await this.abac.getUserRoles(userId);
        this.cache.set(userId, { roles, expiresAt: now + CACHE_TTL_MS });
        return roles;
    }
}
