import * as Joi from 'joi';
import { notPlaceholder } from '@app/shared/utils/env-validation.util';

/**
 * Validado por ConfigModule.forRoot({ validationSchema }) al bootear el
 * proceso. Si falta o quedó con placeholder alguna variable requerida, el
 * proceso no arranca — el error lista TODAS las inválidas de una
 * (abortEarly: false) en vez de fallar en producción horas después de forma
 * silenciosa (ej. ABAC_APP_ID vacío hace que internal-token.guard rechace
 * TODO el tráfico entrante con un 401 sin pista de la causa real).
 *
 * .unknown(true): no rechaza variables no listadas acá — solo garantiza que
 * las que el código SÍ usa estén presentes y con forma válida.
 */
export const micornerEnvSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
    MICORNER_PORT: Joi.number().port().default(3001),
    HOST: Joi.string().optional(),

    // Base de datos — con default localhost/root en código, pero requeridos
    // acá para no depender de ese fallback en staging/prod.
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().port().required(),
    DB_USERNAME: Joi.string().required(),
    DB_PASSWORD: notPlaceholder(Joi.string()).required(),
    DB_DATABASE: Joi.string().required(),
    SYNCHRONIZE_DATABASE: Joi.string().valid('true', 'false').optional(),

    // Auth — M2M
    ABAC_APP_ID: notPlaceholder(Joi.string()).required(),
    ABAC_M2M_TOKEN: notPlaceholder(Joi.string()).required(),
    ED25519_PUBLIC_KEY: notPlaceholder(Joi.string()).required(),
    JWT_ISSUER: Joi.string().default('abac-service'),

    // Egress hacia ServiceNow — único camino es vía api-gateway
    API_GATEWAY_URL: Joi.string().uri().required(),
    SN_INTEGRATION_ENABLED: Joi.string().optional(),
    SN_DEFAULT_COMPANY_SYS_ID: Joi.string().optional(),
    SN_DEFAULT_COMPANY_ID: Joi.string().optional(),
    SN_DEFAULT_TECHNICIAN: Joi.string().optional(),

    // Jobs / feature flags — todos opcionales, desactivados por default
    SNOW_COMPANY_SYNC_ENABLED: Joi.string().optional(),
    SNOW_COMPANY_SYNC_CRON: Joi.string().optional(),
    SNOW_ORPHAN_RECOVERY_ENABLED: Joi.string().optional(),
    SNOW_ORPHAN_RECOVERY_INTERVAL: Joi.number().optional(),
    SNOW_ORPHAN_MIN_AGE_MINUTES: Joi.number().optional(),

    // Observability — best-effort (circuit breaker propio), nunca bloquea el boot
    SERVICE_NAME: Joi.string().optional(),
    LOG_LEVEL: Joi.string().optional(),
    LOG_TRANSPORT_URL: Joi.string().uri().optional(),
    LOG_TRANSPORT_LEVEL: Joi.string().optional(),
    OBS_METRICS_URL: Joi.string().uri().optional(),
    OBS_TRACES_URL: Joi.string().uri().optional(),
    OBS_M2M_TOKEN: Joi.string().optional(),
}).unknown(true);
