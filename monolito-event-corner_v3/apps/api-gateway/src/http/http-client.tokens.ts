import { defineHttpClient } from '@backendkit-labs/http-client';

/**
 * Tokens de inyección para los HTTP clients salientes del api-gateway
 * (sobre @backendkit-labs/http-client). Se inyectan con @InjectHttpClient(token).
 */

/** Cliente hacia el monolito ({MONOLITH_URL}/internal/*). */
export const MONOLITH_HTTP = defineHttpClient('monolith');

/** Cliente hacia ABAC con circuit breaker (roles, batch-evaluate, can-access). */
export const ABAC_HTTP = defineHttpClient('abac');

/**
 * Cliente hacia ABAC SIN circuit breaker.
 * Para validación de token (auth crítica): debe intentar la red siempre,
 * aunque el CB del cliente normal esté abierto. Equivale al antiguo
 * `skipCircuitBreaker: true`.
 */
export const ABAC_HTTP_NOCB = defineHttpClient('abac-nocb');
