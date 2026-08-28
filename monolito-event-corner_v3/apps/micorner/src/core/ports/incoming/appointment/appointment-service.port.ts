import { Result } from '@app/result';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentStatus } from '../../../domain/enums/appointment-status.enum';
import {
  AppointmentId,
  CompanyId,
  CornerId,
  CustomerId,
  IssueTypeId,
  SlotId,
  TechnicianId,
  UserId,
} from '@app/shared/types/branded-ids';

export interface CreateAppointmentCommand {
  issueTypeId: IssueTypeId;
  customerId: UserId;
  cornerId: CornerId;
  slotIds: SlotId[];
  origin: string;
  device: { serialNumber: string };
  metadata?: Record<string, any>;
  /** ID del técnico que generó holds sobre los slots (lote). Si presente, convierte HELD → BOOKED en lugar de AVAILABLE → BOOKED. */
  heldByUserId?: string;
  /** ABAC externalId de quien crea la cita — si resuelve a un técnico, se usa como assigned_to en ServiceNow (solo kind=ISSUE). */
  creatorExternalId?: string;
  /**
   * Requerido cuando la cita es creada por un técnico para un cliente
   * (paridad con Request.create() de hoy, que siempre exigía un técnico
   * creador). Determina `createdByTechnicianId` en el agregado.
   */
  createdByTechnicianId?: TechnicianId;
  /**
   * companyId explícito — requerido cuando `createdByTechnicianId` está
   * presente (paridad con requests.company_id de hoy, explícito por el
   * técnico). Si se omite, se deriva de `User.companyId`.
   */
  companyId?: CompanyId;
  notes?: string;
}

export interface DeliverAppointmentCommand {
  appointmentId: AppointmentId;
  technicianId: TechnicianId;
}

export interface TakeAppointmentCommand {
  appointmentId: AppointmentId;
  technicianId: TechnicianId;
  /** Requerido si la cita está CLOSED: al tomarla se reabre (→ REOPENED) y se reprograma a este horario. */
  slotIds?: SlotId[];
}

export interface ReleaseAppointmentCommand {
  appointmentId: AppointmentId;
  technicianId: TechnicianId;
  reason?: string;
}

export interface RescheduleAppointmentCommand {
  appointmentId: AppointmentId;
  technicianId: TechnicianId;
  slotIds: SlotId[];
}

export interface SetEstimatedCloseCommand {
  appointmentId: AppointmentId;
  technicianId: TechnicianId;
  estimatedCloseAt: Date;
}

export interface ChangeAppointmentStatusCommand {
  appointmentId: AppointmentId;
  technicianId: TechnicianId;
  newStatus: AppointmentStatus;
  comment?: string;
  closeCategory?: string;
}

export interface BatchStatusChangeItem {
  appointmentId: string;
  targetStatus: AppointmentStatus;
  technicianId: string;
  comment?: string;
  closeCategory?: string;
  reason?: string;
}

export interface BatchChangeResult {
  processed: number;
  skipped: number;
  failed: number;
  errors: Array<{ appointmentId: string; reason: string }>;
}

export interface ValidateAppointmentCommand {
  appointmentId: AppointmentId;
  customerId: CustomerId;
}

export interface ReopenAppointmentCommand {
  appointmentId: AppointmentId;
  customerId: CustomerId;
  reason?: string;
}

export interface CancelAppointmentCommand {
  appointmentId: AppointmentId;
  customerId: CustomerId;
  reason?: string;
}

/**
 * Interfaz del servicio unificado de citas (Appointment). Reemplaza
 * IIncidentService + IRequestService: toda la máquina de estados y el ciclo
 * de vida de técnico (deliver/take/release/reschedule/validate/reopen/cancel)
 * aplican por igual a citas kind=ISSUE y kind=REQUEST.
 */
export interface IAppointmentService {
  createAppointment(command: CreateAppointmentCommand): Promise<Result<Appointment>>;
  deliverAppointment(command: DeliverAppointmentCommand): Promise<Result<Appointment>>;
  takeAppointment(command: TakeAppointmentCommand): Promise<Result<Appointment>>;
  releaseAppointment(command: ReleaseAppointmentCommand): Promise<Result<Appointment>>;
  rescheduleAppointment(command: RescheduleAppointmentCommand): Promise<Result<Appointment>>;
  setEstimatedClose(command: SetEstimatedCloseCommand): Promise<Result<Appointment>>;
  changeStatus(command: ChangeAppointmentStatusCommand): Promise<Result<Appointment>>;
  validateAppointment(command: ValidateAppointmentCommand): Promise<Result<Appointment>>;
  reopenAppointment(command: ReopenAppointmentCommand): Promise<Result<Appointment>>;
  cancelAppointment(command: CancelAppointmentCommand): Promise<Result<Appointment>>;
  getAppointment(id: AppointmentId): Promise<Result<Appointment | null>>;
  getAvailableAppointments(cornerId: CornerId): Promise<Result<Appointment[]>>;
  getTechnicianAppointments(technicianId: TechnicianId): Promise<Result<Appointment[]>>;
  getCustomerAppointments(customerId: CustomerId): Promise<Result<Appointment[]>>;
  batchChangeStatus(items: BatchStatusChangeItem[]): Promise<Result<BatchChangeResult>>;
}
