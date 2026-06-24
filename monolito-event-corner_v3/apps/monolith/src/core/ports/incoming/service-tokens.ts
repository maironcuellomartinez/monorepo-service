// core/ports/incoming/service-tokens.ts
/**
 * Tokens (símbolos) para la inyección de dependencias de servicios de aplicación
 * Usados por el API Gateway para consumir los casos de uso del monolito
 */

// Servicios principales
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

// Servicios de administración
export const ISSUE_TYPE_SERVICE = Symbol('IIssueTypeService');

// Servicios de integración
export const SERVICENOW_INTEGRATION_SERVICE = Symbol('IServiceNowIntegrationService');
export const SERVICENOW_PROFILE_SERVICE = Symbol('IServiceNowProfileService');
export const CORNER_ISSUE_CONFIG_SERVICE = Symbol('ICornerIssueConfigService');
export const SERVICENOW_GROUP_SERVICE = Symbol('IServiceNowGroupService');