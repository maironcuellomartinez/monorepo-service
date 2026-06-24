/**
 * Token compartido entre API Gateway y Monolito.
 * El API Gateway lo usa para inyectar el outbound adapter.
 * El Monolito lo usa para inyectar el proxy adapter.
 */
export const SERVICENOW_CLIENT = Symbol('IServiceNowClient');
