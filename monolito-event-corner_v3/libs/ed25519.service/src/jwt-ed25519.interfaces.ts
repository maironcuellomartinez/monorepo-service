export interface JwtEd25519ModuleOptions {
    /**
     * Clave privada en Base64 (64 bytes, la salida completa de nacl.sign.keyPair().secretKey).
     * Si no se provee, se genera una nueva clave en memoria (solo para desarrollo).
     */
    privateKey?: string;

    /**
     * Clave pública en Base64 (32 bytes). Si no se provee, se deriva de la privada.
     */
    publicKey?: string;

    /**
     * Identificador de la clave (kid). Se incluirá en el header del JWT.
     * Útil para rotación de claves.
     */
    kid?: string;

    /**
     * Tiempo de expiración por defecto en segundos.
     */
    defaultExpiresIn?: number;

    /**
     * Si se debe verificar la expiración automáticamente (por defecto true).
     */
    verifyExpiration?: boolean;

    /**
     * Si se deben verificar claims adicionales como 'aud', 'iss', etc.
     */
    verifyClaims?: {
        aud?: string | string[];
        iss?: string;
    };

    /**
     * Si se debe habilitar el logging detallado (por defecto false).
     */
    debug?: boolean;
}

export interface JwtEd25519SignOptions {
    payload: Record<string, any>;
    expiresIn?: number;
    kid?: string;
    /**
     * Sobrescribe el algoritmo (solo EdDSA soportado, pero por si acaso).
     */
    algorithm?: string;
}

export interface JwtEd25519VerifyResult {
    valid: boolean;
    payload?: Record<string, any>;
    error?: string;
}