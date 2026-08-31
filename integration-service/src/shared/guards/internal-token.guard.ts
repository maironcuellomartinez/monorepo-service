import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

// ─── EdDSA / Ed25519 ──────────────────────────────────────────────────────────

/**
 * Convierte una clave pública Ed25519 de 32 bytes en Base64
 * a un KeyObject de Node.js usando el formato DER/SPKI.
 */
function buildEd25519PublicKey(publicKeyBase64: string): crypto.KeyObject {
    const raw = Buffer.from(publicKeyBase64, 'base64');
    if (raw.length !== 32) throw new Error('Clave pública Ed25519 inválida: debe ser 32 bytes');
    // SPKI DER header fijo para Ed25519 (OID 1.3.101.112)
    const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
    const spkiDer = Buffer.concat([spkiHeader, raw]);
    return crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
}

function verifyEddsaJwt(token: string, publicKeyBase64: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('JWT malformado');

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'EdDSA') {
        throw new Error(`Algoritmo no soportado: "${header.alg}". Solo se acepta EdDSA.`);
    }

    const message = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], 'base64url');

    const publicKey = buildEd25519PublicKey(publicKeyBase64);
    const isValid = crypto.verify(null, message, publicKey, signature);
    if (!isValid) throw new Error('Firma inválida');

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expirado');
    }

    return payload;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * Valida que el request provenga de un servicio autorizado de la infraestructura.
 * Requiere Authorization: Bearer <JWT M2M> firmado por ABAC con type='service'.
 * Verifica la firma Ed25519 usando solo ED25519_PUBLIC_KEY — nunca la privada.
 *
 * Solo acepta EdDSA — el algoritmo se fija acá, no se toma del header del
 * token entrante (antes elegía la rama de verificación según lo que dijera
 * el propio token, lo que permitía firmar con HS256 usando JWT_SECRET, un
 * secreto compartido entre varios servicios; ver A-06 en la auditoría de
 * 2026-08-31).
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const auth = request.headers.authorization as string | undefined;

        if (!auth?.startsWith('Bearer ')) {
            throw new UnauthorizedException('M2M JWT requerido (Authorization: Bearer <token>)');
        }

        const token = auth.slice(7);
        const publicKey = this.configService.get<string>('ED25519_PUBLIC_KEY') ?? process.env.ED25519_PUBLIC_KEY;
        if (!publicKey) throw new UnauthorizedException('ED25519_PUBLIC_KEY no configurado');

        try {
            const payload = verifyEddsaJwt(token, publicKey);

            const expectedIss = this.configService.get<string>('security.jwtIssuer') ?? 'abac-service';
            if (payload.iss !== expectedIss) {
                throw new Error(`Emisor inválido: "${payload.iss}"`);
            }

            const expectedAud = this.configService.get<string>('security.jwtAudience') ?? 'abac-clients';
            if (payload.aud !== expectedAud) {
                throw new Error(`Audiencia inválida: "${payload.aud}"`);
            }

            if (payload?.type !== 'service') {
                throw new UnauthorizedException('El token no pertenece a una cuenta de servicio');
            }

            // Ecosystem scoping: si el token declara ownerApplicationId, el
            // servicio llamante solo puede acceder a ecosistemas cuyo
            // ABAC_APP_ID coincida. Sin ownerApplicationId → servicio
            // global → siempre permitido. Mismo criterio que gateway/micorner.
            const tokenOwnerAppId = payload?.ownerApplicationId as string | undefined;
            const localAppId = this.configService.get<string>('abac.appId');
            if (tokenOwnerAppId && localAppId && tokenOwnerAppId !== localAppId) {
                throw new Error(
                    `Token de servicio denegado: ecosistema '${tokenOwnerAppId}' no autorizado para este servicio`,
                );
            }

            (request as any).serviceApp = {
                applicationId: payload.applicationId,
                applicationName: payload.applicationName,
                ownerApplicationId: tokenOwnerAppId ?? null,
            };
            return true;
        } catch (err: any) {
            if (err instanceof UnauthorizedException) throw err;
            throw new UnauthorizedException(`Token M2M inválido: ${err.message}`);
        }
    }
}
