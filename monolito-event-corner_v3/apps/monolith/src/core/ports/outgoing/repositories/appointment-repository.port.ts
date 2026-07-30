import {
  AppointmentId,
  CompanyId,
  CornerId,
  CustomerId,
  IssueTypeId,
  SlotId,
  TechnicianId,
} from '@app/shared/types/branded-ids';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentStatus } from '../../../domain/enums/appointment-status.enum';
import { AppointmentKind } from '../../../domain/enums/appointment-kind.enum';
import { APPOINTMENT_REPOSITORY } from './tokens';
import { Result } from '@app/result';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AppointmentFilters {
  cornerId?: CornerId;
  customerId?: CustomerId;
  companyId?: CompanyId;
  technicianId?: TechnicianId;
  kind?: AppointmentKind;
  /** Si es true, solo devuelve citas sin técnico asignado (current_technician_id IS NULL) */
  availableOnly?: boolean;
  status?: AppointmentStatus[];
  fromDate?: Date;
  toDate?: Date;
  issueTypeId?: IssueTypeId;
  customerEmail?: string;
  servicenowNumber?: string;
  deviceSerial?: string;
  page?: number;
  limit?: number;
}

export interface DeviceSerialSuggestion {
  serialNumber: string;
  model: string | null;
  brand: string | null;
  customerUpn: string | null;
}

export interface ServiceNowNumberSuggestion {
  number: string;
  type: string;
  appointmentId: string;
}

export interface AppointmentTimelineEntry {
  activityId: string;
  appointmentId: string;
  technicianId: string | null;
  technicianName: string | null;
  actionType: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  createdAt: Date;
}

export interface IAppointmentRepository {
  save(appointment: Appointment): Promise<Result<void>>;
  findById(id: AppointmentId | string): Promise<Result<Appointment | null>>;
  findAvailable(cornerId: CornerId): Promise<Result<Appointment[]>>;
  findByStatus(
    cornerId: CornerId,
    statuses: AppointmentStatus[],
  ): Promise<Result<Appointment[]>>;
  findByTechnician(technicianId: TechnicianId | string): Promise<Result<Appointment[]>>;
  findByCustomer(customerId: CustomerId | string): Promise<Result<Appointment[]>>;
  findByDateRange(
    cornerId: CornerId,
    start: Date,
    end: Date,
  ): Promise<Result<Appointment[]>>;
  findWithFilters(
    filters: AppointmentFilters,
  ): Promise<Result<PaginatedResult<Appointment>>>;
  findBySlotId(slotId: SlotId): Promise<Result<Appointment | null>>;
  /**
   * De los slotIds dados, devuelve el subconjunto que todavía tiene OTRA
   * cita activa (no terminal) enganchada — excluyendo excludeAppointmentId.
   * Se usa para no liberar/expirar un slot mientras otra cita (p.ej. otro
   * walk-in de técnico sobre el mismo slot) lo siga usando.
   */
  findActiveAppointmentSlotIds(
    slotIds: SlotId[],
    excludeAppointmentId: AppointmentId,
  ): Promise<Result<Set<string>>>;
  /** Busca por el número de ticket SN, uniendo contra servicenow_ticket_links. */
  findByServiceNowNumber(number: string): Promise<Result<Appointment | null>>;
  update(appointment: Appointment): Promise<Result<void>>;
  saveEvents(appointmentId: AppointmentId | string, events: any[]): Promise<Result<void>>;
  /** Devuelve citas activas (no terminales) asociadas a un dispositivo */
  findActiveByDeviceId(deviceId: string): Promise<Result<Appointment[]>>;
  /**
   * Devuelve citas no terminales sin ningún ServiceNowTicketLink activo
   * (ninguno, o todos en ABANDONED) creadas hace más de `minAgeMinutes`
   * minutos — candidatas a re-registro en SN. Generaliza
   * findOrphanedSnowIncidents (antes Incident-only) a cualquier kind.
   */
  findOrphanedTicketAppointments(minAgeMinutes: number): Promise<Result<Appointment[]>>;
  /** Devuelve IDs únicos de clientes con al menos una cita activa */
  findActiveCustomerIds(): Promise<
    Result<{ customerId: string; externalId: string | null }[]>
  >;
  /** Devuelve la línea de tiempo de una cita ordenada por fecha */
  getTimeline(appointmentId: AppointmentId | string): Promise<Result<AppointmentTimelineEntry[]>>;
  /** Agrega una nota manual a la línea de tiempo sin cambiar el estado */
  addNote(
    appointmentId: AppointmentId | string,
    technicianId: TechnicianId | null,
    comment: string,
  ): Promise<Result<void>>;
  /** Seriales de dispositivo (con datos de contexto) que matchean `q`, acotados al corner — para autocomplete del filtro de citas. */
  suggestDeviceSerials(
    cornerId: CornerId | string,
    q: string,
    limit?: number,
  ): Promise<Result<DeviceSerialSuggestion[]>>;
  /** Números de ticket ServiceNow que matchean `q`, acotados al corner — para autocomplete del filtro de citas. */
  suggestServiceNowNumbers(
    cornerId: CornerId | string,
    q: string,
    limit?: number,
  ): Promise<Result<ServiceNowNumberSuggestion[]>>;
}

export { APPOINTMENT_REPOSITORY };
