import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Verifica un JWT firmado con HMAC-SHA256 sin dependencias externas.
 * Usa Node.js crypto built-in para máxima portabilidad entre servicios.
 */
function verifyHs256Jwt(token: string, secret: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('JWT malformado');

    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${parts[0]}.${parts[1]}`)
        .digest('base64url');

    if (signature !== parts[2]) throw new Error('Firma inválida');

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expirado');
    }

    return payload;
}

/**
 * Guard M2M — valida JWT de tipo 'service' emitidos por ABAC.
 *
 * Requiere:
 *   - Header: Authorization: Bearer <jwt>
 *   - JWT firmado con JWT_SECRET (HMAC-SHA256)
 *   - Payload: { type: 'service', applicationId, applicationName }
 *
 * Inyecta `request.serviceApp` con { applicationId, applicationName }
 * para trazabilidad en el handler receptor.
 *
 * Nota: No requiere JwtModule — usa crypto built-in de Node.js.
 */
@Injectable()
export class M2mJwtGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
        const request = ctx.switchToHttp().getRequest<Request>();
        const auth = request.headers.authorization as string | undefined;

        if (!auth?.startsWith('Bearer ')) {
            throw new UnauthorizedException('M2M JWT requerido (Authorization: Bearer <token>)');
        }

        const token = auth.slice(7);
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            throw new UnauthorizedException('JWT_SECRET no configurado en el servicio receptor');
        }

        try {
            const payload = verifyHs256Jwt(token, secret);

            if (payload.type !== 'service') {
                throw new UnauthorizedException('El token no pertenece a una cuenta de servicio');
            }

            (request as any).serviceApp = {
                applicationId:   payload.applicationId,
                applicationName: payload.applicationName,
            };

            return true;
        } catch (err: any) {
            if (err instanceof UnauthorizedException) throw err;
            throw new UnauthorizedException(`Token M2M inválido: ${err.message}`);
        }
    }
}
