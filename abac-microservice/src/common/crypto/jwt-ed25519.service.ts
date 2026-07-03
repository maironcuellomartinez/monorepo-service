import * as nacl from 'tweetnacl';

const DEFAULT_ALG = 'EdDSA';

export interface JwtEd25519SignOptions {
    payload: Record<string, any>;
    expiresIn?: number;
    kid?: string;
}

export interface JwtEd25519VerifyResult {
    valid: boolean;
    payload?: Record<string, any>;
    error?: string;
}

/**
 * Utilidades estáticas para JWT con EdDSA (Ed25519).
 * Sin estado — usa tweetnacl directamente.
 *
 * Firma: solo en ABAC (clave privada).
 * Verificación: en cualquier servicio (clave pública).
 */
export class JwtEd25519Service {
    /**
     * Firma un payload y retorna un JWT EdDSA.
     * @param privateKeyBase64 - 64 bytes Base64 (secretKey completa de nacl.sign.keyPair).
     */
    static signWithKey(
        privateKeyBase64: string,
        options: JwtEd25519SignOptions,
        globalOptions?: { kid?: string; defaultExpiresIn?: number },
    ): string {
        // Buffer.from(str, 'base64') ignora en silencio caracteres inválidos en vez de
        // lanzar error — sin esta validación, un ED25519_PRIVATE_KEY corrupto puede decodificar
        // a un buffer que pasa el chequeo de 64 bytes y firmar tokens con una clave distinta
        // a la esperada, sin ningún error visible.
        if (!JwtEd25519Service.isValidBase64(privateKeyBase64)) {
            throw new Error('Clave privada inválida: no es una cadena Base64 válida.');
        }
        const privateKey = Buffer.from(privateKeyBase64, 'base64');
        if (privateKey.length !== 64) throw new Error('Clave privada inválida: debe ser 64 bytes en Base64.');

        const finalPayload = { ...options.payload };
        const ttl = options.expiresIn ?? globalOptions?.defaultExpiresIn;
        if (ttl) {
            const now = Math.floor(Date.now() / 1000);
            finalPayload.iat = now;
            finalPayload.exp = now + ttl;
        }

        const header: Record<string, string> = { alg: DEFAULT_ALG, typ: 'JWT' };
        const kid = options.kid ?? globalOptions?.kid;
        if (kid) header.kid = kid;

        const headerB64 = JwtEd25519Service.encodeB64Url(JSON.stringify(header));
        const payloadB64 = JwtEd25519Service.encodeB64Url(JSON.stringify(finalPayload));
        const message = `${headerB64}.${payloadB64}`;
        const signature = nacl.sign.detached(Buffer.from(message), privateKey);

        return `${message}.${JwtEd25519Service.encodeB64Url(signature)}`;
    }

    /**
     * Genera un nuevo par de claves Ed25519.
     * @returns { publicKey, privateKey } en Base64.
     */
    static generateKeyPair(): { publicKey: string; privateKey: string } {
        const kp = nacl.sign.keyPair();
        return {
            publicKey: Buffer.from(kp.publicKey).toString('base64'),
            privateKey: Buffer.from(kp.secretKey).toString('base64'),
        };
    }

    private static isValidBase64(value: string): boolean {
        if (!value || value.length % 4 !== 0) return false;
        return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
    }

    private static encodeB64Url(data: string | Uint8Array): string {
        const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
        return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
}
