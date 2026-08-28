import { AppointmentId } from '@app/shared/types/branded-ids';
import { ServiceNowTicketLink } from '../../../domain/entities/servicenow-ticket-link.entity';
import { SERVICENOW_TICKET_LINK_REPOSITORY } from './tokens';
import { Result } from '@app/result';

export interface ITicketLinkRepository {
  save(link: ServiceNowTicketLink): Promise<Result<void>>;
  update(link: ServiceNowTicketLink): Promise<Result<void>>;
  findById(id: string): Promise<Result<ServiceNowTicketLink | null>>;
  findByAppointmentId(appointmentId: AppointmentId | string): Promise<Result<ServiceNowTicketLink[]>>;
  /** Links con snowq_correlation_id pendiente de reconciliar (sys_id aún null). Generaliza el equivalente incident/request de hoy a cualquier ticket type. */
  findPendingSnowqReconciliation(): Promise<Result<ServiceNowTicketLink[]>>;
}

export { SERVICENOW_TICKET_LINK_REPOSITORY };
