// core/ports/index.ts
/**
 * Exporta todos los puertos (interfaces) para el API Gateway
 *
 * Este archivo es el punto de entrada para que el API Gateway
 * conozca los contratos de los servicios del monolito.
 *
 * Uso:
 * import { IIncidentService, INCIDENT_SERVICE } from 'monolito-event-corner/core/ports';
 */

// ==================== PUERTOS DE ENTRADA (Casos de Uso) ====================

// Servicios principales
export { IIncidentService, CreateIncidentCommand, DeliverIncidentCommand, TakeIncidentCommand, ReleaseIncidentCommand, ChangeIncidentStatusCommand, BatchStatusChangeItem, BatchChangeResult } from './incoming/incident/incident-service.port';
export { IAvailabilityService, AvailabilityQuery, SlotAvailabilityDto, TechnicianAvailabilityDto } from './incoming/availability/availability-service.port';
export { IRequestService } from './incoming/request/request-service.port';
export { ICornerService } from './incoming/corner/corner-service.port';
export { IScheduleService } from './incoming/schedule/schedule-service.port';
export { ITechnicianService } from './incoming/technician/technician-service.port';
export { ILockerService } from './incoming/locker/locker-service.port';
export { IDeviceService } from './incoming/device/device-service.port';
export { IUserService } from './incoming/user/user-service.port';
export { ICompanyService } from './incoming/company/company-service.port';

// Servicios de administración
export { IIssueTypeService } from './incoming/admin/issue-type-service.port';

// Servicios de integración
// export { IServiceNowIntegrationService } from './incoming/servicenow/integration-service.port';
export { IServiceNowProfileService } from './incoming/servicenow/profile-service.port';

// ==================== TOKENS ====================

export {
    // Servicios principales
    INCIDENT_SERVICE,
    AVAILABILITY_SERVICE,
    REQUEST_SERVICE,
    CORNER_SERVICE,
    SCHEDULE_SERVICE,
    TECHNICIAN_SERVICE,
    LOCKER_SERVICE,
    DEVICE_SERVICE,
    USER_SERVICE,
    COMPANY_SERVICE,
    // Servicios de administración
    ISSUE_TYPE_SERVICE,
    // Servicios de integración
    SERVICENOW_INTEGRATION_SERVICE,
    SERVICENOW_PROFILE_SERVICE,
} from './incoming/service-tokens';

// ==================== PUERTOS DE SALIDA ====================

export {
    SERVICE_NOW_PROFILE_REPOSITORY,
    COMPANY_REPOSITORY,
    ISSUE_TYPE_REPOSITORY,
    CORNER_REPOSITORY,
    SCHEDULE_REPOSITORY,
    TECHNICIAN_REPOSITORY,
    SLOT_REPOSITORY,
    INCIDENT_REPOSITORY,
    USER_REPOSITORY,
    DEVICE_REPOSITORY,
    LOCKER_REPOSITORY,
    REQUEST_REPOSITORY,
} from './outgoing/repositories/tokens';

// Interfaces de repositorios (para referencia)
export { IServiceNowProfileRepository } from './outgoing/repositories/servicenow-profile-repository.port';
export { ICompanyRepository } from './outgoing/repositories/company-repository.port';
export { IIssueTypeRepository } from './outgoing/repositories/issue-type-repository.port';
export { ICornerRepository } from './outgoing/repositories/corner-repository.port';
export { IScheduleRepository } from './outgoing/repositories/schedule-repository.port';
export { ITechnicianRepository } from './outgoing/repositories/technician-repository.port';
export { ISlotRepository } from './outgoing/repositories/slot-repository.port';
export { IIncidentRepository } from './outgoing/repositories/incident-repository.port';
export { IUserRepository } from './outgoing/repositories/user-repository.port';
export { IDeviceRepository } from './outgoing/repositories/device-repository.port';
export { ILockerRepository } from './outgoing/repositories/locker-repository.port';
export { IRequestRepository } from './outgoing/repositories/request-repository.port';

// Event Bus
export { IEventBus } from './outgoing/event-bus/event-bus.port';

// Cache
export { ICache } from './outgoing/cache/cache.port';