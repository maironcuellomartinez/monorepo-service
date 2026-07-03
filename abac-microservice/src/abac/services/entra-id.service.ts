// abac-microservice/src/abac/services/entra-id.service.ts
import { Injectable, Logger, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';

export interface EntraIdPayload {
    oid: string;           // Azure AD object ID — identificador único del usuario
    email: string;         // preferred_username o email
    name?: string;         // displayName
    groups?: string[];     // group object IDs (si el tenant lo envía)
    iss: string;
    aud: string | string[];
    exp: number;
    iat: number;
}

/**
 * Valida tokens de Microsoft Entra ID (Azure AD) usando el endpoint JWKS.
 * Centralizado en ABAC para que el gateway no necesite hacer validación JWKS local.
 *
 * Variables de entorno (en abac-microservice/.env.*):
 *   AZURE_TENANT_ID   Tenant ID del directorio Azure AD
 *   AZURE_CLIENT_ID   Client ID de la app registration (audience del token)
 *   AZURE_JWKS_URI    (opcional) Override del JWKS URI
 */
@Injectable()
export class EntraIdService implements OnModuleInit {
    private readonly logger = new Logger(EntraIdService.name);
    private readonly client: jwksRsa.JwksClient; // Cliente para obtener las claves públicas de Entra ID
    private readonly audience: string; // Audience del token
    private readonly issuer: string; // Issuer del token
    private readonly enabled: boolean; // Si Entra ID está habilitado

    constructor() {
        const tenantId = process.env.AZURE_TENANT_ID ?? '';
        const clientId = process.env.AZURE_CLIENT_ID ?? '';
        const jwksUri = process.env.AZURE_JWKS_URI ??
            `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;

        this.audience = clientId;
        this.issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
        this.enabled = !!(tenantId && clientId);

        this.client = jwksRsa({
            jwksUri,
            timeout: 5000, // evita colgar el login si Azure no responde (default de la lib: 30s)
            cache: true,
            cacheMaxEntries: 10,
            cacheMaxAge: 10 * 60 * 1000,  // 10 minutos
            rateLimit: true,
            jwksRequestsPerMinute: 10,
        });
    }

    get isEnabled(): boolean { return this.enabled; }

    onModuleInit() {
        if (!this.enabled) {
            this.logger.warn(
                'AZURE_TENANT_ID o AZURE_CLIENT_ID no configurados — validación Entra ID deshabilitada',
            );
        }
    }

    /** Valida la firma del token contra JWKS y retorna el payload. Lanza si es inválido. */
    async validate(token: string): Promise<EntraIdPayload> {
        if (!this.enabled) {
            throw new ServiceUnavailableException('Entra ID no está configurado (faltan AZURE_TENANT_ID / AZURE_CLIENT_ID)');
        }

        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.header?.kid) {
            throw new UnauthorizedException('Token malformado — falta kid en el header');
        }

        let publicKey: string;
        try {
            const key = await this.client.getSigningKey(decoded.header.kid);
            publicKey = key.getPublicKey();
        } catch (error) {
            // Distinguir fallo de red/JWKS (infra) de un kid inexistente (token inválido)
            this.logger.error(`No se pudo obtener la clave de firma de Entra ID: ${(error as Error).message}`);
            throw new ServiceUnavailableException('No se pudo verificar el token contra Entra ID — JWKS no disponible');
        }

        let payload: any;
        try {
            payload = jwt.verify(token, publicKey, {
                audience: this.audience,
                issuer: this.issuer,
                algorithms: ['RS256'],
            });
        } catch (error) {
            throw new UnauthorizedException(`Token de Entra ID inválido: ${(error as Error).message}`);
        }

        const email = payload.preferred_username ?? payload.email ?? payload.upn ?? '';
        const oid = payload.oid ?? payload.sub;

        if (!oid) throw new UnauthorizedException('Token Entra ID sin oid/sub');
        if (!email) throw new UnauthorizedException('Token Entra ID sin email/preferred_username');

        return {
            oid,
            email,
            name: payload.name,
            groups: payload.groups,
            iss: payload.iss,
            aud: payload.aud,
            exp: payload.exp,
            iat: payload.iat,
        };
    }
}
