// Copied from libs/ed25519.service — static methods only, no NestJS injection needed.
import * as nacl from 'tweetnacl';

const JWT_ALG = 'EdDSA';

export interface VerifyResult {
    valid: boolean;
    payload?: Record<string, any>;
    error?: string;
}

export class JwtEd25519Service {
    static verifyWithKey(
        publicKeyBase64: string,
        token: string,
        options?: {
            verifyExpiration?: boolean;
            verifyClaims?: { iss?: string; aud?: string | string[] };
        },
    ): VerifyResult {
        try {
            const publicKey = Buffer.from(publicKeyBase64, 'base64');
            if (publicKey.length !== 32) throw new Error('Clave pública inválida: debe ser 32 bytes en Base64.');

            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Token malformado.');
            const [headerB64, payloadB64, signatureB64] = parts;

            const header = JSON.parse(JwtEd25519Service.b64Decode(headerB64));
            if (header.alg !== JWT_ALG) throw new Error(`Algoritmo no soportado: ${header.alg}.`);

            const message = `${headerB64}.${payloadB64}`;
            const signature = new Uint8Array(Buffer.from(JwtEd25519Service.padB64(signatureB64), 'base64'));
            if (!nacl.sign.detached.verify(Buffer.from(message), signature, publicKey)) {
                throw new Error('Firma inválida.');
            }

            const payload = JSON.parse(JwtEd25519Service.b64Decode(payloadB64));

            if (options?.verifyExpiration !== false && typeof payload.exp === 'number') {
                if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expirado.');
            }

            if (options?.verifyClaims?.iss && payload.iss !== options.verifyClaims.iss) {
                throw new Error(`Emisor inválido: "${payload.iss}".`);
            }

            if (options?.verifyClaims?.aud) {
                const expected = options.verifyClaims.aud;
                const actual: string | string[] = payload.aud;
                const match = Array.isArray(actual)
                    ? actual.includes(expected as string)
                    : actual === expected;
                if (!match) throw new Error(`Audience inválido: "${actual}".`);
            }

            return { valid: true, payload };
        } catch (e: any) {
            return { valid: false, error: e.message };
        }
    }

    private static b64Decode(s: string): string {
        return Buffer.from(JwtEd25519Service.padB64(s), 'base64').toString('utf8');
    }

    private static padB64(s: string): string {
        let r = s.replace(/-/g, '+').replace(/_/g, '/');
        while (r.length % 4) r += '=';
        return r;
    }
}
