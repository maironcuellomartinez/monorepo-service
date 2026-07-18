// core/domain/errors/incident.errors.ts
import { DomainError } from './domain-error';
import { IncidentId, TechnicianId } from '../value-objects/ids';
import { IncidentStatus } from '../enums/incident-status.enum';

export class IncidentNotFoundError extends DomainError {
  readonly code = 'INCIDENT_NOT_FOUND';

  constructor(id: IncidentId) {
    super(`Incident with id ${id} not found`);
  }
}

export class IncidentNotAvailableError extends DomainError {
  readonly code = 'INCIDENT_NOT_AVAILABLE';

  constructor(id: IncidentId) {
    super(`Incident ${id} is not available to be taken`);
  }
}

export class IncidentAlreadyTakenError extends DomainError {
  readonly code = 'INCIDENT_ALREADY_TAKEN';

  constructor(id: IncidentId) {
    super(`Incident ${id} has already been taken by another technician`);
  }
}

export class InvalidIncidentStateError extends DomainError {
  readonly code = 'INVALID_INCIDENT_STATE';

  constructor(status: IncidentStatus, operation: string) {
    super(`Cannot ${operation} incident in state ${status}`);
  }
}

export class TechnicianNotAuthorizedError extends DomainError {
  readonly code = 'TECHNICIAN_NOT_AUTHORIZED';

  constructor(technicianId: TechnicianId, operation: string) {
    super(`Technician ${technicianId} is not authorized to ${operation}`);
  }
}

export class SlotNotAvailableError extends DomainError {
  readonly code = 'SLOT_NOT_AVAILABLE';

  constructor(slotId: string) {
    super(`Slot ${slotId} is not available`);
  }
}

export class InvalidDateRangeError extends DomainError {
  readonly code = 'INVALID_DATE_RANGE';

  constructor(start: Date, end: Date) {
    super(
      `Invalid date range: ${start.toISOString()} must be before ${end.toISOString()}`,
    );
  }
}

export class InsufficientSlotsError extends DomainError {
  readonly code = 'INSUFFICIENT_SLOTS';

  constructor(requestedMinutes: number, availableMinutes: number) {
    super(
      `Not enough consecutive slots available: need ${requestedMinutes} minutes, only ${availableMinutes} available`,
    );
  }
}

export class LockerNotAvailableError extends DomainError {
  readonly code = 'LOCKER_NOT_AVAILABLE';

  constructor(lockerId: string) {
    super(`Locker ${lockerId} is not available`);
  }
}

export class TechnicianNotAvailableError extends DomainError {
  readonly code = 'TECHNICIAN_NOT_AVAILABLE';

  constructor(technicianId: TechnicianId, date: Date) {
    super(`Technician ${technicianId} not available on ${date.toISOString()}`);
  }
}

export class IssueTypeNotFoundError extends DomainError {
  readonly code = 'ISSUE_TYPE_NOT_FOUND';

  constructor(id: string) {
    super(`Issue type ${id} not found`);
  }
}

export class ServiceNowProfileNotFoundError extends DomainError {
  readonly code = 'SERVICENOW_PROFILE_NOT_FOUND';

  constructor(id: string) {
    super(`ServiceNow profile ${id} not found`);
  }
}

export class DeviceHasActiveIncidentError extends DomainError {
  readonly code = 'DEVICE_ALREADY_HAS_ACTIVE_INCIDENT';

  constructor(serialNumber: string, incidentRef?: string) {
    super(
      `El dispositivo ${serialNumber} ya tiene una incidencia activa${incidentRef ? ` (${incidentRef})` : ''}. Cerrala o cancelala antes de crear otra.`,
    );
  }
}

export class ServiceNowProfileAlreadyExistsError extends DomainError {
  readonly code = 'SERVICENOW_PROFILE_ALREADY_EXISTS';

  constructor(snowCompanySysId: string) {
    super(
      `Ya existe un perfil de ServiceNow para el sys_id ${snowCompanySysId}`,
    );
  }
}
