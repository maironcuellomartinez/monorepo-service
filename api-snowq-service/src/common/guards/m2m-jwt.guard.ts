import { CanActivate, ExecutionContext, Injectable, OnModuleInit, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtEd25519Service } from '../crypto/jwt-ed25519.service';
import { RevokedApplicationsPoller } from './revoked-applications.poller';

/**
 * Valida que el request provenga de un servicio autorizado de la infraestructura.
 * Requiere Authorization: Bearer <JWT M2M> firmado por ABAC con type='service'.
 * Verifica la firma Ed25519 usando solo ED25519_PUBLIC_KEY — nunca la clave privada.
 *
 * Además de la firma, rechaza tokens de aplicaciones desactivadas en ABAC
 * (RevokedApplicationsPoller, cacheado en memoria y refrescado por
 * intervalo — nunca sincrono con el request). Ver A-07 en la auditoría de
 * 2026-08-31.
 */
@Injectable()
export class M2mJwtGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
    private readonly revokedApps = new RevokedApplicationsPoller(process.env.ABAC_URL ?? 'http://localhost:3005');

    onModuleInit(): void {
        this.revokedApps.start();
    }

    onModuleDestroy(): void {
        this.revokedApps.stop();
    }

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

        if (this.revokedApps.isRevoked(result.payload?.applicationId)) {
            throw new UnauthorizedException('Token M2M revocado — la aplicación fue desactivada en ABAC');
        }

        (request as any).serviceApp = {
            applicationId:   result.payload.applicationId,
            applicationName: result.payload.applicationName,
        };

        return true;
    }
}
