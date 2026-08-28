import * as Joi from 'joi';
import { notPlaceholder } from '@app/shared/utils/env-validation.util';

/**
 * Validado por ConfigModule.forRoot({ validationSchema }) al bootear el
 * proceso. Si falta o quedó con placeholder alguna variable requerida, el
 * proceso no arranca — el error lista TODAS las inválidas de una
 * (abortEarly: false) en vez de fallar en producción horas después con un
 * 500 "Monolith unreachable" críptico porque MICORNER_URL apuntaba al
 * fallback de código (localhost) por no estar seteada.
 *
 * .unknown(true): no rechaza variables no listadas acá — solo garantiza que
 * las que el código SÍ usa estén presentes y con forma válida.
 */
export const apiGatewayEnvSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
    API_GATEWAY_PORT: Joi.number().port().default(4000),
    CORS_ORIGINS: Joi.string().optional(),

    // Auth — M2M / ABAC
    // JWT_SECRET: no lo consume ningún guard activo en este proceso —
    // M2mJwtGuard (libs/shared) existe pero no está montado acá, lo usa
    // api-snowq-service. Se deja opcional para no exigir algo sin efecto real.
    JWT_SECRET: Joi.string().optional(),
    JWT_ISSUER: Joi.string().default('abac-service'),
    ABAC_URL: Joi.string().uri().required(),
    ABAC_APP_ID: notPlaceholder(Joi.string()).required(),
    ABAC_API_KEY: notPlaceholder(Joi.string()).required(),
    ABAC_M2M_TOKEN: notPlaceholder(Joi.string()).required(),
    ED25519_PUBLIC_KEY: notPlaceholder(Joi.string()).required(),

    // Egress hacia servicios downstream — con default en código, pero
    // requeridos acá para no depender de ese fallback en staging/prod.
    MICORNER_URL: Joi.string().uri().required(),
    SNOWQ_URL: Joi.string().uri().required(),
    INTEGRATION_SERVICE_INVENTORY_URL: Joi.string().uri().optional(),

    // Outbound (resiliencia) — todos con default en código, opcionales acá
    OUTBOUND_WRITE_CONCURRENCY: Joi.number().integer().positive().optional(),
    OUTBOUND_READ_CONCURRENCY: Joi.number().integer().positive().optional(),
    OUTBOUND_WRITE_TIMEOUT_MS: Joi.number().integer().positive().optional(),
    OUTBOUND_READ_TIMEOUT_MS: Joi.number().integer().positive().optional(),
    OUTBOUND_CB_TIMEOUT_MS: Joi.number().integer().positive().optional(),

    // Observability — best-effort (circuit breaker propio), nunca bloquea el boot
    SERVICE_NAME: Joi.string().optional(),
    LOG_LEVEL: Joi.string().optional(),
    LOG_TRANSPORT_ENABLED: Joi.string().optional(),
    LOG_TRANSPORT_URL: Joi.string().uri().optional(),
    LOG_TRANSPORT_LEVEL: Joi.string().optional(),
    LOG_TRANSPORT_INTERVAL: Joi.number().optional(),
    LOG_TRANSPORT_BATCH: Joi.number().optional(),
    OBS_METRICS_URL: Joi.string().uri().optional(),
    OBS_METRICS_INTERVAL: Joi.number().optional(),
    OBS_METRICS_BATCH: Joi.number().optional(),
    OBS_TRACES_URL: Joi.string().uri().optional(),
    OBS_TRACES_INTERVAL: Joi.number().optional(),
    OBS_TRACES_BATCH: Joi.number().optional(),
    OBS_M2M_TOKEN: Joi.string().optional(),
}).unknown(true);
