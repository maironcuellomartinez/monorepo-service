import * as nacl from 'tweetnacl';

const DEFAULT_ALG = 'EdDSA';

export interface JwtEd25519VerifyResult {
    valid: boolean;
    payload?: Record<string, any>;
    error?: string;
}

export interface JwtSignOptions {
    payload: Record<string, any>;
    expiresIn?: number;
    kid?: string;
}

export class JwtEd25519Service {
    static verifyWithKey(
        publicKeyBase64: string,
        token: string,
        options?: {
            verifyExpiration?: boolean;
            verifyClaims?: { aud?: string | string[]; iss?: string };
        },
    ): JwtEd25519VerifyResult {
        try {
            const publicKey = Buffer.from(publicKeyBase64, 'base64');
            if (publicKey.length !== 32) throw new Error('Clave pública inválida: debe ser 32 bytes.');

            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Token malformado.');
            const [headerB64, payloadB64, signatureB64] = parts;

            const header = JSON.parse(JwtEd25519Service.decodeB64Url(headerB64));
            if (header.alg !== DEFAULT_ALG) throw new Error(`Algoritmo no soportado: "${header.alg}".`);

            const message   = `${headerB64}.${payloadB64}`;
            const signature = new Uint8Array(Buffer.from(JwtEd25519Service.padB64(signatureB64).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
            const isValid   = nacl.sign.detached.verify(Buffer.from(message), signature, publicKey);
            if (!isValid) throw new Error('Firma inválida.');

            const payload = JSON.parse(JwtEd25519Service.decodeB64Url(payloadB64));

            if (options?.verifyExpiration !== false && typeof payload.exp === 'number') {
                if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expirado.');
            }

            if (options?.verifyClaims) {
                const { aud, iss } = options.verifyClaims;
                if (aud !== undefined) {
                    const valid = Array.isArray(aud) ? aud.includes(payload.aud) : payload.aud === aud;
                    if (!valid) throw new Error(`Audiencia inválida: "${payload.aud}".`);
                }
                if (iss !== undefined && payload.iss !== iss) throw new Error(`Emisor inválido: "${payload.iss}".`);
            }

            return { valid: true, payload };
        } catch (err: any) {
            return { valid: false, error: err.message };
        }
    }

    private static decodeB64Url(data: string): string {
        return Buffer.from(JwtEd25519Service.padB64(data), 'base64').toString('utf8');
    }

    private static padB64(data: string): string {
        let s = data.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return s;
    }
}
