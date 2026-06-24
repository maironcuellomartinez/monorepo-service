import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
    sub: string;          // userId (UUID) — viene de ABAC
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    oid?: string;          // Azure Entra ID object ID (solo para tokens Entra)
    tokenType: string;     // 'entra' | 'oauth' | etc.
    permissions: string[];
}

/**
 * Extrae el payload del usuario del request (inyectado por JwtGuard).
 *
 * @example async create(@CurrentUser() user: JwtPayload)
 */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): JwtPayload => {
        const request = ctx.switchToHttp().getRequest();
        return request.user as JwtPayload;
    },
);
