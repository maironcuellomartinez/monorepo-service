import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export const JWT_AUTH_SERVICE = 'JWT_AUTH_SERVICE';
export const JWT_ADMIN_SERVICE = 'JWT_ADMIN_SERVICE';

const COOKIE_NAME = 'admin_session';

/**
 * Guard compuesto que acepta dos metodos de autenticacion:
 * 1. Cookie de sesion de admin (admin_session) — verificada con JwtService de admin
 * 2. Bearer token de cliente externo (access_token) — verificado con JwtService de auth
 *
 * Si ninguno es valido, lanza UnauthorizedException.
 */
@Injectable()
export class AdminOrAccessGuard implements CanActivate {
    constructor(
        @Inject(JWT_ADMIN_SERVICE) private readonly adminJwt: JwtService,
        @Inject(JWT_AUTH_SERVICE) private readonly authJwt: JwtService,
    ) { }

    /**
     * Valida la autenticacion del usuario.
     * @param ctx - El contexto de la solicitud.
     * @returns True si la autenticacion es exitosa, false en caso contrario.
     * @description Valida dos metodos de autenticacion: cookie de sesion de admin y Bearer token de cliente externo.
     */
    canActivate(ctx: ExecutionContext): boolean {
        const request = ctx.switchToHttp().getRequest<Request>();

        // 1. Intentar autenticacion por cookie de admin
        const cookieToken = this.extractCookie(request);
        if (cookieToken) {
            try {
                const payload = this.adminJwt.verify(cookieToken) as any;
                (request as any).adminUser = { username: payload.username };
                return true;
            } catch {
                // Si falla la cookie, continuamos para probar Bearer token
            }
        }

        // 2. Intentar autenticacion por Bearer token de cliente externo
        const auth = request.headers.authorization as string | undefined;
        if (auth?.startsWith('Bearer ')) {
            const token = auth.slice(7);

            try {
                const payload = this.authJwt.verify(token) as any;
                if (payload.type !== 'external_client') {
                    throw new UnauthorizedException('Token no pertenece a una aplicacion externa');
                }
                (request as any).externalClient = { clientId: payload.sub, clientName: payload.clientName };
                return true;
            } catch (err: any) {
                if (err instanceof UnauthorizedException) throw err;
                throw new UnauthorizedException('Token invalido o expirado');
            }
        }

        // 3. Ningun metodo fue valido
        throw new UnauthorizedException('Se requiere sesion de admin o access_token valido');
    }

    private extractCookie(request: Request): string | undefined {
        const cookieHeader = request.headers.cookie;
        if (!cookieHeader) return undefined;

        for (const raw of cookieHeader.split(';')) {
            const cookie = raw.trim();
            const eqIdx = cookie.indexOf('=');
            if (eqIdx === -1) continue;
            const name = cookie.slice(0, eqIdx).trim();
            if (name === COOKIE_NAME) {
                return cookie.slice(eqIdx + 1);
            }
        }
        return undefined;
    }
}
