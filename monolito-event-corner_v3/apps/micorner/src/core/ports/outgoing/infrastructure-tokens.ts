// core/ports/outgoing/infrastructure-tokens.ts
/**
 * Tokens de infraestructura internos del micorner.
 * SERVICENOW_CLIENT vive en @app/shared/contracts/tokens porque
 * es compartido con el API Gateway.
 */
export { SERVICENOW_CLIENT } from '@app/shared/contracts/tokens';
export const EVENT_BUS = Symbol('EVENT_BUS');
export const IN_MEMORY_EVENT_BUS = Symbol('IN_MEMORY_EVENT_BUS');
export const CACHE = Symbol('CACHE');
export const EXTERNAL_INVENTORY_SERVICE = Symbol('EXTERNAL_INVENTORY_SERVICE');
export const HOLIDAY_PROVIDER = Symbol('HOLIDAY_PROVIDER');
