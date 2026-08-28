// core/domain/entities/servicenow-ticket-link.entity.ts
import { Result } from '@app/result';
import { AppointmentId } from '../value-objects/ids';
import { ServiceNowId } from '../value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../value-objects/servicenow-number.value';
import { ServiceNowTicketType } from '../value-objects/servicenow-ticket-type.value';

/**
 * Rol del link dentro de la cita, para que el código sepa cuál es "el"
 * ticket a pollear/cerrar sin escanear todos los links de la cita.
 * `primary`: el ticket principal (el único link para citas ISSUE, o la RITM
 * para citas REQUEST). `fulfillment`: trabajo de cumplimiento derivado
 * (sc_task), enlaza de vuelta a la RITM vía `parentRequestSysId`.
 */
export type ServiceNowTicketLinkRole = 'primary' | 'fulfillment';

export type ServiceNowTicketLinkStatus = 'PENDING' | 'ACTIVE' | 'CLOSED' | 'ABANDONED';

export interface ServiceNowTicketLinkProps {
  id: string;
  appointmentId: AppointmentId;
  type: ServiceNowTicketType;
  role: ServiceNowTicketLinkRole;
  sysId: ServiceNowId | null;
  number: ServiceNowNumber | null;
  /** Solo para type='sc_task': sys_id de la RITM (sc_req_item) padre. */
  parentRequestSysId: string | null;
  snowqCorrelationId: string | null;
  status: ServiceNowTicketLinkStatus;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Vínculo polimórfico entre un `Appointment` y un ticket de ServiceNow.
 * Cardinalidad 1:N respecto a Appointment: una cita REQUEST puede tener un
 * link `sc_req_item` (la RITM) y uno o más `sc_task` (cumplimiento); la
 * recuperación de huérfanos puede dejar un link `ABANDONED` como auditoría
 * en vez de sobreescribirlo.
 */
export class ServiceNowTicketLink {
  private constructor(private props: ServiceNowTicketLinkProps) {}

  get id(): string {
    return this.props.id;
  }
  get appointmentId(): AppointmentId {
    return this.props.appointmentId;
  }
  get type(): ServiceNowTicketType {
    return this.props.type;
  }
  get role(): ServiceNowTicketLinkRole {
    return this.props.role;
  }
  get sysId(): ServiceNowId | null {
    return this.props.sysId;
  }
  get number(): ServiceNowNumber | null {
    return this.props.number;
  }
  get parentRequestSysId(): string | null {
    return this.props.parentRequestSysId;
  }
  get snowqCorrelationId(): string | null {
    return this.props.snowqCorrelationId;
  }
  get status(): ServiceNowTicketLinkStatus {
    return this.props.status;
  }
  get closedAt(): Date | null {
    return this.props.closedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Modo síncrono/inmediato: ServiceNow devolvió sysId+number en el momento de creación. */
  resolveImmediate(sysId: ServiceNowId, number: ServiceNowNumber): void {
    this.props.sysId = sysId;
    this.props.number = number;
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();
  }

  /** Modo diferido: el ticket quedó encolado en api-snowq-service, se resuelve luego por reconciliación. */
  markDeferred(correlationId: string): void {
    this.props.snowqCorrelationId = correlationId;
    this.props.updatedAt = new Date();
  }

  /** El reconciler obtuvo sysId+number de un ticket que estaba en modo diferido. */
  reconcileDelivered(sysId: ServiceNowId, number: ServiceNowNumber): void {
    this.props.sysId = sysId;
    this.props.number = number;
    this.props.snowqCorrelationId = null;
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();
  }

  close(closedAt: Date = new Date()): void {
    this.props.status = 'CLOSED';
    this.props.closedAt = closedAt;
    this.props.updatedAt = new Date();
  }

  /** Recuperación de huérfanos: se abandona este link (queda de auditoría) en vez de sobreescribirlo. */
  abandon(): void {
    this.props.status = 'ABANDONED';
    this.props.updatedAt = new Date();
  }

  toJSON() {
    return {
      ...this.props,
      sysId: this.props.sysId?.value ?? null,
      number: this.props.number?.value ?? null,
    };
  }

  static createPending(
    id: string,
    appointmentId: AppointmentId,
    type: ServiceNowTicketType,
    role: ServiceNowTicketLinkRole = 'primary',
    parentRequestSysId: string | null = null,
  ): Result<ServiceNowTicketLink> {
    if (type === 'sc_task' && !parentRequestSysId) {
      return Result.err(new Error('sc_task links require a parentRequestSysId'));
    }

    const now = new Date();
    return Result.ok(
      new ServiceNowTicketLink({
        id,
        appointmentId,
        type,
        role,
        sysId: null,
        number: null,
        parentRequestSysId,
        snowqCorrelationId: null,
        status: 'PENDING',
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  static reconstitute(props: ServiceNowTicketLinkProps): ServiceNowTicketLink {
    return new ServiceNowTicketLink(props);
  }
}
