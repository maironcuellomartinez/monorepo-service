// api-gateway/src/auth/entra-id.service.ts
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

/**
 * Servicio mínimo en el gateway para routing de tokens Entra ID.
 * La validación JWKS y el lazy sync se centralizaron en abac-microservice
 * (POST /auth/validate-entra). Este servicio solo detecta si un token
 * pertenece a Entra ID (decode local, sin llamada a red).
 */
@Injectable()
export class EntraIdService {
    /** Retorna true si el token Bearer parece ser de Entra ID (por el issuer). */
    isEntraIdToken(token: string): boolean {
        try {
            const decoded = jwt.decode(token) as any;
            return typeof decoded?.iss === 'string' &&
                decoded.iss.includes('login.microsoftonline.com');
        } catch {
            return false;
        }
    }
}
