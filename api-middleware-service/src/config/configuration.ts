const DEV_FALLBACK_PREFIX = 'dev-only--';
const MIN_SECRET_LENGTH = 32;

function requiredSecret(key: string, fallback: string): string {
    const env = process.env.NODE_ENV ?? 'development';
    const value = process.env[key];

    if (env !== 'development') {
        if (!value || value.length < MIN_SECRET_LENGTH) {
            throw new Error(
                `Variable de entorno '${key}' no configurada o demasiado corta (min ${MIN_SECRET_LENGTH} chars). ` +
                `Revisa .env.${env} antes de iniciar el servicio.`,
            );
        }
        if (value.startsWith(DEV_FALLBACK_PREFIX)) {
            throw new Error(
                `Variable de entorno '${key}' tiene un valor de desarrollo ('${value}'). ` +
                `Configura un valor real para el entorno '${env}'.`,
            );
        }
        return value;
    }

    return value ?? fallback;
}

export default () => {
    const env = process.env.NODE_ENV ?? 'development';

    return {
        app: {
            port: parseInt(process.env.PORT ?? '3007', 10),
            env,
        },
        db: {
            host:        process.env.DB_HOST ?? 'localhost',
            port:        parseInt(process.env.DB_PORT ?? '3306', 10),
            username:    process.env.DB_USERNAME ?? 'root',
            password:    process.env.DB_PASSWORD ?? 'root',
            database:    process.env.DB_DATABASE ?? 'middleware_db',
            synchronize: process.env.SYNCHRONIZE_DATABASE === 'true',
        },
        jwt: {
            secret: requiredSecret('JWT_SECRET', 'dev-only--replace-in-staging-and-production'),
        },
        admin: {
            apiKey:        process.env.ADMIN_API_KEY ?? 'dev-only--replace-in-staging-and-production',
            user:          process.env.ADMIN_USER ?? '',
            passHash:      process.env.ADMIN_PASS_HASH ?? '',
            sessionSecret: requiredSecret('ADMIN_SESSION_SECRET', 'dev-only--replace-in-staging-and-production'),
        },
        gateway: {
            url:      process.env.API_GATEWAY_URL ?? 'http://localhost:3000',
            m2mToken: process.env.ABAC_M2M_TOKEN ?? 'dev-only--replace-in-staging-and-production',
        },
        extIssues: {
            url:   process.env.EXT_ISSUES_URL   ?? 'http://localhost:3003',
            token: process.env.EXT_ISSUES_TOKEN ?? '',
        },
        bulkhead: {
            http: {
                concurrency:  parseInt(process.env.HTTP_BULKHEAD_CONCURRENCY ?? '50', 10),
                maxQueueSize: parseInt(process.env.HTTP_BULKHEAD_MAX_QUEUE ?? '100', 10),
            },
        },
    };
};
