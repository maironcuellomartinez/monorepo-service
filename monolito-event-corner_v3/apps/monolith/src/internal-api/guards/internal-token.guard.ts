import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtEd25519Service } from '@app/ed25519';

/**
 * Valida que el request provenga de un servicio autorizado de la infraestructura.
 * Requiere Authorization: Bearer <JWT M2M> emitido por ABAC con type='service'.
 * Verifica la firma Ed25519 usando solo la clave pública — nunca la privada.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const auth    = request.headers.authorization as string | undefined;

        if (!auth?.startsWith('Bearer ')) {
            throw new UnauthorizedException('M2M JWT requerido (Authorization: Bearer <token>)');
        }

        const token     = auth.slice(7);
        const publicKey = this.config.get<string>('ED25519_PUBLIC_KEY');

        if (!publicKey) throw new UnauthorizedException('ED25519_PUBLIC_KEY no configurado');

        const result = JwtEd25519Service.verifyWithKey(publicKey, token, {
            verifyExpiration: true,
            verifyClaims: {
                iss: this.config.get<string>('JWT_ISSUER') ?? 'abac-service',
            },
        });

        if (!result.valid) {
            throw new UnauthorizedException(`Token M2M inválido: ${result.error}`);
        }

        if (result.payload?.type !== 'service') {
            throw new UnauthorizedException('El token no pertenece a una cuenta de servicio');
        }

        // Ecosystem scoping: si el token declara ownerApplicationId, el servicio
        // llamante solo puede acceder a ecosistemas cuyo ABAC_APP_ID coincida.
        // Sin ownerApplicationId → servicio global → siempre permitido.
        const tokenOwnerAppId = result.payload?.ownerApplicationId as string | undefined;
        const localAppId      = this.config.get<string>('ABAC_APP_ID');
        if (tokenOwnerAppId && localAppId && tokenOwnerAppId !== localAppId) {
            throw new UnauthorizedException(
                `Token de servicio denegado: ecosistema '${tokenOwnerAppId}' no autorizado para este servicio`,
            );
        }

        (request as any).serviceApp = {
            applicationId:      result.payload.applicationId,
            applicationName:    result.payload.applicationName,
            ownerApplicationId: tokenOwnerAppId ?? null,
        };
        return true;
    }
}
