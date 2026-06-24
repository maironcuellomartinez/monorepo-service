import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbacService } from '../services/abac.service';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private abacService: AbacService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermissions = this.reflector.get<string[]>(
            'permissions',
            context.getHandler(),
        );

        const requiredRoles = this.reflector.get<string[]>(
            'roles',
            context.getHandler(),
        );

        if ((!requiredPermissions || requiredPermissions.length === 0) && !requiredRoles) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const app = request.application;

        if (!user) {
            throw new ForbiddenException('Acceso no autorizado');
        }

        const userRoles = user.roles || [];
        const userRoleNames = userRoles.map((ur: any) => ur.role?.name || '');

        // super-admin tiene acceso total — bypass de checks de rol y permiso
        if (userRoleNames.includes('super-admin')) {
            return true;
        }

        if (requiredRoles && requiredRoles.length > 0) {
            const hasRole = requiredRoles.some((role: string) => userRoleNames.includes(role));

            if (!hasRole) {
                throw new ForbiddenException(`Rol requerido: ${requiredRoles.join(', ')}`);
            }
        }

        if (requiredPermissions && requiredPermissions.length > 0) {
            // Para evaluar permisos ABAC se necesita app.id
            if (!app) {
                throw new ForbiddenException('Acceso no autorizado: aplicacion no identificada');
            }
            for (const permission of requiredPermissions) {
                const [resource, action] = permission.split(':');
                const hasAccess = await this.abacService.canAccess(
                    user.id,
                    app.id,
                    resource,
                    action,
                    (request as any).context || {},
                );

                if (!hasAccess) {
                    throw new ForbiddenException(`Permiso denegado: ${permission}`);
                }
            }
        }

        return true;
    }
}
