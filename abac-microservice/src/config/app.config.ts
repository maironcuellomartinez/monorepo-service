export const appConfig = () => ({
    environment: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT),
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    apiRateLimit: Number(process.env.API_RATE_LIMIT),
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    // Ed25519 — asymmetric signing for M2M service tokens
    ed25519PrivateKey: process.env.ED25519_PRIVATE_KEY ?? '',
    ed25519PublicKey: process.env.ED25519_PUBLIC_KEY ?? '',
    ed25519Kid: process.env.ED25519_KID ?? 'abac-m2m-v1',
});