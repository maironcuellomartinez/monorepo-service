import { Injectable, Logger, Inject } from '@nestjs/common';
import * as nacl from 'tweetnacl';
import { JWT_ED25519_OPTIONS, JWT_ED25519_DEFAULT_ALG } from './jwt-ed25519.constants';
import {
    JwtEd25519ModuleOptions,
    JwtEd25519SignOptions,
    JwtEd25519VerifyResult,
} from './jwt-ed25519.interfaces';

@Injectable()
export class JwtEd25519Service {
    private readonly logger = new Logger(JwtEd25519Service.name);

    private readonly privateKey: Uint8Array | null = null;
    private readonly publicKey: Uint8Array;
    private readonly kid?: string;
    private readonly defaultExpiresIn?: number;
    private readonly verifyExpiration: boolean;
    private readonly verifyClaims?: { aud?: string | string[]; iss?: string };
    private readonly debug: boolean;

    constructor(@Inject(JWT_ED25519_OPTIONS) options: JwtEd25519ModuleOptions) {
        this.verifyExpiration = options.verifyExpiration !== false;
        this.verifyClaims     = options.verifyClaims;
        this.defaultExpiresIn = options.defaultExpiresIn;
        this.kid              = options.kid;
        this.debug            = options.debug ?? false;

        if (options.privateKey) {
            const pk = Buffer.from(options.privateKey, 'base64');
            if (pk.length !== 64) {
                throw new Error('Clave privada inválida: debe ser 64 bytes en Base64 (secretKey de nacl.sign.keyPair).');
            }
            this.privateKey = pk;
            this.publicKey   = options.publicKey
                ? Buffer.from(options.publicKey, 'base64')
                : nacl.sign.keyPair.fromSecretKey(pk).publicKey;
        } else {
            const kp        = nacl.sign.keyPair();
            this.privateKey = kp.secretKey;
            this.publicKey  = kp.publicKey;
            this.logger.warn(
                'No se proporcionaron claves. Se generó un par efímero en memoria. ¡Las claves se perderán al reiniciar! Usa solo en desarrollo.',
            );
        }

        if (this.publicKey.length !== 32) {
            throw new Error('Clave pública inválida: debe ser 32 bytes.');
        }

        if (this.debug) {
            this.logger.log(`JwtEd25519Service inicializado. kid=${this.kid ?? 'sin kid'}`);
        }
    }

    // ─── Métodos de instancia ──────────────────────────────────────────────────

    /**
     * Firma un payload y retorna un JWT con algoritmo EdDSA.
     */
    sign(options: JwtEd25519SignOptions): string {
        if (!this.privateKey) {
            throw new Error('No hay clave privada configurada para firmar.');
        }
        return JwtEd25519Service.signWithKey(
            Buffer.from(this.privateKey).toString('base64'),
            options,
            {
                kid:             this.kid,
                defaultExpiresIn: this.defaultExpiresIn,
            },
        );
    }

    /**
     * Verifica la firma y los claims de un JWT usando la clave pública configurada.
     */
    verify(token: string): JwtEd25519VerifyResult {
        return JwtEd25519Service.verifyWithKey(
            Buffer.from(this.publicKey).toString('base64'),
            token,
            {
                verifyExpiration: this.verifyExpiration,
                verifyClaims:     this.verifyClaims,
                debug:            this.debug,
            },
        );
    }

    /**
     * Decodifica el payload de un JWT **sin verificar** la firma ni los claims.
     * Útil para inspección de tokens en logs o middlewares.
     */
    decode(token: string): Record<string, any> | null {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            return JSON.parse(JwtEd25519Service.decodeBase64Url(parts[1]));
        } catch {
            return null;
        }
    }

    /**
     * Retorna la clave pública del servicio en Base64.
     * Útil para exponerla en un endpoint JWKS.
     */
    getPublicKeyBase64(): string {
        return Buffer.from(this.publicKey).toString('base64');
    }

    // ─── Métodos estáticos ─────────────────────────────────────────────────────

    /**
     * Genera un nuevo par de claves Ed25519.
     * @returns `{ publicKey, privateKey }` ambas en Base64.
     */
    static generateKeyPair(): { publicKey: string; privateKey: string } {
        const kp = nacl.sign.keyPair();
        return {
            publicKey:  Buffer.from(kp.publicKey).toString('base64'),
            privateKey: Buffer.from(kp.secretKey).toString('base64'),
        };
    }

    /**
     * Firma un payload con una clave privada arbitraria (sin necesidad de instancia).
     *
     * @param privateKeyBase64 - Clave privada en Base64 (64 bytes / secretKey completa de nacl).
     * @param options          - Payload y opciones por-firma (expiresIn, kid, algorithm).
     * @param globalOptions    - Valores globales de fallback (kid, defaultExpiresIn).
     */
    static signWithKey(
        privateKeyBase64: string,
        options: JwtEd25519SignOptions,
        globalOptions?: { kid?: string; defaultExpiresIn?: number },
    ): string {
        const privateKey = Buffer.from(privateKeyBase64, 'base64');
        if (privateKey.length !== 64) {
            throw new Error('Clave privada inválida: debe ser 64 bytes en Base64.');
        }

        // Construir payload final
        const finalPayload = { ...options.payload };
        const ttl = options.expiresIn ?? globalOptions?.defaultExpiresIn;
        if (ttl) {
            finalPayload.exp = Math.floor(Date.now() / 1000) + ttl;
            finalPayload.iat = Math.floor(Date.now() / 1000);
        }

        // Construir header
        const header: Record<string, string> = {
            alg: JWT_ED25519_DEFAULT_ALG,
            typ: 'JWT',
        };
        const kid = options.kid ?? globalOptions?.kid;
        if (kid) header.kid = kid;

        // Codificar y firmar
        const headerB64  = JwtEd25519Service.encodeBase64Url(JSON.stringify(header));
        const payloadB64 = JwtEd25519Service.encodeBase64Url(JSON.stringify(finalPayload));
        const message    = `${headerB64}.${payloadB64}`;
        const signature  = nacl.sign.detached(Buffer.from(message), privateKey);

        return `${message}.${JwtEd25519Service.encodeBase64Url(signature)}`;
    }

    /**
     * Verifica un JWT con una clave pública arbitraria (sin necesidad de instancia).
     *
     * @param publicKeyBase64 - Clave pública en Base64 (32 bytes).
     * @param token           - JWT a verificar.
     * @param options         - Opciones: verifyExpiration, verifyClaims, debug.
     */
    static verifyWithKey(
        publicKeyBase64: string,
        token: string,
        options?: {
            verifyExpiration?: boolean;
            verifyClaims?: { aud?: string | string[]; iss?: string };
            debug?: boolean;
        },
    ): JwtEd25519VerifyResult {
        const debug = options?.debug ?? false;
        try {
            const publicKey = Buffer.from(publicKeyBase64, 'base64');
            if (publicKey.length !== 32) {
                throw new Error('Clave pública inválida: debe ser 32 bytes en Base64.');
            }

            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Token malformado: se esperan 3 segmentos separados por ".".');
            const [headerB64, payloadB64, signatureB64] = parts;

            // Decodificar header y verificar algoritmo
            const header = JSON.parse(JwtEd25519Service.decodeBase64Url(headerB64));
            if (header.alg !== JWT_ED25519_DEFAULT_ALG) {
                throw new Error(`Algoritmo no soportado: "${header.alg}". Solo se acepta "${JWT_ED25519_DEFAULT_ALG}".`);
            }

            // Verificar firma criptográfica
            const message   = `${headerB64}.${payloadB64}`;
            const signature = JwtEd25519Service.decodeBase64UrlBytes(signatureB64);
            const isValid   = nacl.sign.detached.verify(Buffer.from(message), signature, publicKey);
            if (!isValid) throw new Error('Firma inválida.');

            const payload = JSON.parse(JwtEd25519Service.decodeBase64Url(payloadB64));

            // Verificar expiración
            if (options?.verifyExpiration !== false && typeof payload.exp === 'number') {
                if (payload.exp < Math.floor(Date.now() / 1000)) {
                    throw new Error('Token expirado.');
                }
            }

            // Verificar claims adicionales
            if (options?.verifyClaims) {
                const { aud, iss } = options.verifyClaims;
                if (aud !== undefined) {
                    const tokenAud = payload.aud;
                    const valid    = Array.isArray(aud) ? aud.includes(tokenAud) : tokenAud === aud;
                    if (!valid) throw new Error(`Audiencia inválida: "${tokenAud}".`);
                }
                if (iss !== undefined && payload.iss !== iss) {
                    throw new Error(`Emisor inválido: "${payload.iss}".`);
                }
            }

            return { valid: true, payload };
        } catch (error: any) {
            if (debug) {
                console.error('[JwtEd25519] Verificación fallida:', error.message);
            }
            return { valid: false, error: error.message };
        }
    }

    // ─── Utilidades internas Base64Url ─────────────────────────────────────────

    /** Convierte string o bytes a Base64Url (sin padding `=`). */
    private static encodeBase64Url(data: string | Uint8Array): string {
        const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
        return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    /** Decodifica un segmento Base64Url a string UTF-8. */
    private static decodeBase64Url(data: string): string {
        return Buffer.from(JwtEd25519Service.padBase64(data), 'base64').toString('utf8');
    }

    /** Decodifica un segmento Base64Url a bytes (Uint8Array). */
    private static decodeBase64UrlBytes(data: string): Uint8Array {
        return new Uint8Array(Buffer.from(JwtEd25519Service.padBase64(data), 'base64'));
    }

    /** Añade padding `=` para que sea Base64 estándar válido. */
    private static padBase64(data: string): string {
        let s = data.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return s;
    }
}