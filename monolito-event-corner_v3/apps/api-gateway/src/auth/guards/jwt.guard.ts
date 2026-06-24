import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { IS_INTERNAL } from '../decorators/internal.decorator';
import { AbacClient } from '../abac.client';
import { JwtPayload } from '../decorators/current-user.decorator';
import { JwtEd25519Service } from '@app/ed25519';

/**
 * JwtGuard — unico guard de autenticacion en api-gateway.
 *
 * Routing:
 *  - @Public()           → permite directo
 *  - @InternalOnly()     → M2M local (EdDSA/Ed25519, ED25519_PUBLIC_KEY)
 *                          Solo para trafico infraestructura:
 *                          monolith, integration-service, api-snowq,
 *                          api-middleware → api-gateway
 *  - (sin decorator)     → delega 100% a ABAC
 *                          Client apps siempre usan Entra ID (Bearer token)
 *
 * ABAC es la unica fuente de verdad para tokens de clientes.
 * M2M usa validacion local para ser rapido y resiliente.
 */
@Injectable()
export class JwtGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly abacClient: AbacClient,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const handlers = [ctx.getHandler(), ctx.getClass()];

        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, handlers)) return true;

        if (this.reflector.getAllAndOverride<boolean>(IS_INTERNAL, handlers)) {
            return this.validateInternalToken(ctx);
        }

        // ── Client app: todos los Bearer tokens van a ABAC ─────────────────────
        // Client apps solo usan Entra ID (nunca M2M).
        // ABAC valida contra Azure (JWKS) + lazy sync.
        const request = ctx.switchToHttp().getRequest<Request>();
        const token = this.extractToken(request);

        if (!token) {
            throw new UnauthorizedException('Token de autorización requerido');
        }

        return this.validateWithAbac(request, token);
    }

    // ── M2M local (EdDSA/Ed25519) ───────────────────────────────────────────────

    /**
     * Valida tokens M2M localmente con Ed25519.
     * Solo para @InternalOnly() — tráfico infraestructura a infraestructura.
     * Solo requiere ED25519_PUBLIC_KEY — nunca la clave privada.
     */
    private validateInternalToken(ctx: ExecutionContext): boolean {
        const request = ctx.switchToHttp().getRequest<Request>();
        const auth = request.headers.authorization as string | undefined;

        if (!auth?.startsWith('Bearer ')) {
            throw new UnauthorizedException('M2M JWT requerido (Authorization: Bearer <token>)');
        }

        const token = auth.slice(7);
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

        // Ecosystem scoping: si el token declara ownerApplicationId, el servicio
        // llamante solo puede acceder a ecosistemas cuyo ABAC_APP_ID coincida.
        // Sin ownerApplicationId → servicio global → siempre permitido.
        const tokenOwnerAppId = result.payload?.ownerApplicationId as string | undefined;
        const localAppId      = process.env.ABAC_APP_ID;
        if (tokenOwnerAppId && localAppId && tokenOwnerAppId !== localAppId) {
            throw new UnauthorizedException(
                `Token de servicio denegado: ecosistema '${tokenOwnerAppId}' no autorizado para este gateway`,
            );
        }

        (request as any).serviceApp = {
            applicationId:      result.payload.applicationId,
            applicationName:    result.payload.applicationName,
            ownerApplicationId: tokenOwnerAppId ?? null,
        };
        return true;
    }

    // ── Delegacion a ABAC (clientes) ───────────────────────────────────────────

    /**
     * Valida tokens de cliente via ABAC.
     * ABAC valida contra Azure (Entra ID / JWKS) + lazy sync.
     */
    private async validateWithAbac(request: Request, token: string): Promise<boolean> {
        const result = await this.abacClient.validateToken(token);

        if (!result) {
            throw new UnauthorizedException('Token inválido o ABAC no disponible');
        }

        (request as any).user = {
            sub: result.userId,
            email: result.email,
            username: result.email?.split('@')[0] ?? result.userId,
            firstName: result.firstName ?? '',
            lastName: result.lastName ?? '',
            oid: result.oid,
            tokenType: result.tokenType,
            permissions: result.permissions,
        } as JwtPayload;

        return true;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private extractToken(request: Request): string | undefined {
        const auth = request.headers.authorization;
        if (!auth) return undefined;
        const [type, token] = auth.split(' ');
        return type === 'Bearer' ? token : undefined;
    }
}
