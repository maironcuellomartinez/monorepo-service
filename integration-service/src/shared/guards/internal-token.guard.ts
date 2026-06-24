import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

// ─── HS256 (symmetric) ────────────────────────────────────────────────────────

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

// ─── EdDSA / Ed25519 (asymmetric) ────────────────────────────────────────────

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
 * Requiere Authorization: Bearer <JWT M2M> emitido por ABAC.
 *
 * Soporta:
 *   - EdDSA (Ed25519)  — algoritmo actual de ABAC (clave pública vía ED25519_PUBLIC_KEY)
 *   - HS256            — legado / fallback (clave simétrica vía JWT_SECRET)
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

        // Detectar algoritmo del header JWT antes de verificar firma
        let alg = 'HS256';
        try {
            const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
            alg = header.alg ?? 'HS256';
        } catch {
            throw new UnauthorizedException('JWT malformado: header inválido');
        }

        try {
            let payload: Record<string, any>;

            if (alg === 'EdDSA') {
                const publicKey = this.configService.get<string>('ED25519_PUBLIC_KEY') ?? process.env.ED25519_PUBLIC_KEY;
                if (!publicKey) throw new UnauthorizedException('ED25519_PUBLIC_KEY no configurado');
                payload = verifyEddsaJwt(token, publicKey);
            } else {
                const secret = this.configService.get<string>('security.jwtSecret') ?? process.env.JWT_SECRET;
                if (!secret) throw new UnauthorizedException('JWT_SECRET no configurado');
                payload = verifyHs256Jwt(token, secret);
            }

            if (payload?.type !== 'service') {
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
