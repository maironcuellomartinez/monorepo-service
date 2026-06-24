import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtEd25519Service } from '../crypto/jwt-ed25519.service';

/**
 * Valida que el request provenga de un servicio autorizado de la infraestructura.
 * Requiere Authorization: Bearer <JWT M2M> firmado por ABAC con type='service'.
 * Verifica la firma Ed25519 usando solo ED25519_PUBLIC_KEY — nunca la clave privada.
 */
@Injectable()
export class M2mJwtGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
        const request = ctx.switchToHttp().getRequest<Request>();
        const auth    = request.headers.authorization as string | undefined;

        if (!auth?.startsWith('Bearer ')) {
            throw new UnauthorizedException('M2M JWT requerido (Authorization: Bearer <token>)');
        }

        const token     = auth.slice(7);
        const publicKey = process.env.ED25519_PUBLIC_KEY;

        if (!publicKey) {
            throw new UnauthorizedException('ED25519_PUBLIC_KEY no configurado');
        }

        const result = JwtEd25519Service.verifyWithKey(publicKey, token, {
            verifyExpiration: true,
            verifyClaims: {
                iss: process.env.JWT_ISSUER ?? 'abac-service',
            },
        });

        if (!result.valid) {
            throw new UnauthorizedException(`Token M2M inválido: ${result.error}`);
        }

        if (result.payload?.type !== 'service') {
            throw new UnauthorizedException('El token no pertenece a una cuenta de servicio');
        }

        (request as any).serviceApp = {
            applicationId:   result.payload.applicationId,
            applicationName: result.payload.applicationName,
        };

        return true;
    }
}
