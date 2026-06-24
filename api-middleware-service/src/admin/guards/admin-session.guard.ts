import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JWT_ADMIN_SERVICE } from '../../auth/guards/admin-or-access.guard';

const COOKIE_NAME = 'admin_session';

/**
 * Guard para endpoints administrativos protegidos por sesion.
 * Lee la cookie `admin_session`, verifica el JWT firmado con ADMIN_SESSION_SECRET,
 * y si es valido, inyecta `req.adminUser` con el payload del token.
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
    constructor(@Inject(JWT_ADMIN_SERVICE) private readonly jwtService: JwtService) { }

    canActivate(ctx: ExecutionContext): boolean {
        const request = ctx.switchToHttp().getRequest<Request>();
        const token = this.extractCookie(request);

        if (!token) {
            throw new UnauthorizedException('Sesion no iniciada');
        }

        try {
            const payload = this.jwtService.verify(token);
            (request as any).adminUser = { username: payload.username };
            return true;
        } catch {
            throw new UnauthorizedException('Sesion invalida o expirada');
        }
    }

    /**
     * Extrae la cookie 'admin_session' de las cabeceras de la solicitud.
     * @param request - El objeto de solicitud que contiene las cookies.
     * @returns El valor de la cookie 'admin_session', o undefined si no se encuentra.
     * @description Se utiliza un parse manual del header Cookie para extraer el valor de la cookie.
     */
    private extractCookie(request: Request): string | undefined {
        const cookieHeader = request.headers.cookie;
        if (!cookieHeader) return undefined;

        // Parse manual del header Cookie (evita indexacion insegura)
        for (const raw of cookieHeader.split(';')) {
            const cookie = raw.trim();
            const eqIdx = cookie.indexOf('=');
            if (eqIdx === -1) continue;
            const name = cookie.slice(0, eqIdx).trim();
            if (name === COOKIE_NAME) {
                return cookie.slice(eqIdx + 1); // re-join por si el valor contiene =
            }
        }
        return undefined;
    }
}
