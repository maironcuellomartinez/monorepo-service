// core/domain/errors/appointment.errors.ts
import { DomainError } from './domain-error';
import { AppointmentId } from '../value-objects/ids';
import { TechnicianId } from '../value-objects/ids';
import { AppointmentStatus } from '../enums/appointment-status.enum';

export class AppointmentNotFoundError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_FOUND';

  constructor(id: AppointmentId | string) {
    super(`Appointment with id ${id} not found`);
  }
}

export class AppointmentNotAvailableError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_AVAILABLE';

  constructor(id: AppointmentId) {
    super(`Appointment ${id} is not available to be taken`);
  }
}

export class InvalidAppointmentStateError extends DomainError {
  readonly code = 'INVALID_APPOINTMENT_STATE';

  constructor(status: AppointmentStatus, operation: string) {
    super(`Cannot ${operation} appointment in state ${status}`);
  }
}

export class AppointmentTechnicianNotAuthorizedError extends DomainError {
  readonly code = 'APPOINTMENT_TECHNICIAN_NOT_AUTHORIZED';

  constructor(technicianId: TechnicianId, operation: string) {
    super(`Technician ${technicianId} is not authorized to ${operation}`);
  }
}

export class DeviceHasActiveAppointmentError extends DomainError {
  readonly code = 'DEVICE_ALREADY_HAS_ACTIVE_APPOINTMENT';

  constructor(serialNumber: string, appointmentRef?: string) {
    super(
      `El dispositivo ${serialNumber} ya tiene una cita activa${appointmentRef ? ` (${appointmentRef})` : ''}. Cerrala o cancelala antes de crear otra.`,
    );
  }
}
