/**
 * Token compartido entre API Gateway y Micorner.
 * El API Gateway lo usa para inyectar el outbound adapter.
 * El Micorner lo usa para inyectar el proxy adapter.
 */
export const SERVICENOW_CLIENT = Symbol('IServiceNowClient');
