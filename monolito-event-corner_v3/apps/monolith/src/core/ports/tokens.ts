// core/ports/tokens.ts
/**
 * Tokens (símbolos) para la inyección de dependencias de servicios
 * Estos tokens permiten al API Gateway consumir los servicios del monolito
 */

// Servicios de Aplicación (Puertos de Entrada)
export const INCIDENT_SERVICE = Symbol('IIncidentService');
export const AVAILABILITY_SERVICE = Symbol('IAvailabilityService');
export const REQUEST_SERVICE = Symbol('IRequestService');
export const CORNER_SERVICE = Symbol('ICornerService');
export const SCHEDULE_SERVICE = Symbol('IScheduleService');
export const TECHNICIAN_SERVICE = Symbol('ITechnicianService');
export const LOCKER_SERVICE = Symbol('ILockerService');
export const DEVICE_SERVICE = Symbol('IDeviceService');
export const USER_SERVICE = Symbol('IUserService');
export const COMPANY_SERVICE = Symbol('ICompanyService');
export const ISSUE_TYPE_SERVICE = Symbol('IIssueTypeService');
export const SERVICENOW_INTEGRATION_SERVICE = Symbol('IServiceNowIntegrationService');

// Puertos de Salida (Adaptadores)
export const EVENT_BUS_PORT = Symbol('IEventBus');
export const CACHE_PORT = Symbol('ICache');