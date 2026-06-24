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
import { PERMISSION_KEY, RequiredPermission } from '../decorators/permission.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class AbacGuard implements CanActivate {
    private readonly logger = new Logger(AbacGuard.name);

    constructor(
        private readonly abac: AbacClient,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        // Endpoints públicos omiten verificación
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);
        if (isPublic) return true;

        // Si el endpoint no tiene @Permission(), se permite (solo requiere autenticación)
        const permission = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
            PERMISSION_KEY,
            [ctx.getHandler(), ctx.getClass()],
        );
        if (!permission) return true;

        const request = ctx.switchToHttp().getRequest<Request>();
        const user    = (request as any).user as JwtPayload | undefined;

        if (!user?.sub) {
            throw new ForbiddenException('Usuario no autenticado');
        }

        const context: Record<string, unknown> = {
            ip:        request.ip,
            userAgent: request.headers['user-agent'],
            path:      request.path,
            method:    request.method,
        };

        const granted = await this.abac.canAccess(
            user.sub,
            permission.resource,
            permission.action,
            context,
        );

        if (!granted) {
            this.logger.warn(
                `Acceso denegado: user=${user.sub} ${permission.resource}:${permission.action} path=${request.path}`,
            );
            throw new ForbiddenException(
                `No tienes permiso para: ${permission.resource}:${permission.action}`,
            );
        }

        return true;
    }
}
