// core/services/servicenow/servicenow-integration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { TracingService } from '@app/observability';
import { IIssueTypeRepository } from '../../ports/outgoing/repositories/issue-type-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { IServiceNowProfileRepository } from '../../ports/outgoing/repositories/servicenow-profile-repository.port';
import { ICompanyIssueConfigRepository } from '../../ports/outgoing/repositories/corner-issue-config-repository.port';
import { IServiceNowClient } from '../../ports/outgoing/servicenow/servicenow-client.port';
import { Appointment } from '../../domain/entities/appointment.entity';
import { ServiceNowTicketLink } from '../../domain/entities/servicenow-ticket-link.entity';
import { ServiceNowTicketType } from '../../domain/value-objects/servicenow-ticket-type.value';
import { Company } from '../../domain/entities/company.entity';
import { Corner } from '../../domain/entities/corner.entity';
import { IssueTypeNotFoundError } from '../../domain/errors/servicenow.errors';
import { ServiceNowId } from '../../domain/value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../../domain/value-objects/servicenow-number.value';
import { CompanyId, IssueTypeId } from '@app/shared/types/branded-ids';
import { Result } from '@app/result';

/** Tipos de ticket que este servicio sabe crear directamente. `sc_task` no se crea acá — solo se enlaza (ver §Fase4 del plan). */
type CreatableTicketType = Extract<ServiceNowTicketType, 'incident' | 'sc_req_item'>;

@Injectable()
export class ServiceNowIntegrationService {
  private readonly logger = new Logger(ServiceNowIntegrationService.name);

  constructor(
    private readonly issueTypeRepo: IIssueTypeRepository,
    private readonly cornerRepo: ICornerRepository,
    private readonly profileRepo: IServiceNowProfileRepository,
    private readonly snClient: IServiceNowClient,
    private readonly companyIssueConfigRepo: ICompanyIssueConfigRepository,
    private readonly tracing: TracingService,
  ) {}

  /**
   * Referencia externa estable enviada a snowq (campo `externalId`, usado para
   * el fingerprint de deduplicación — ver computeFingerprint en api-snowq-service —
   * y para poblar u_external_system_id en ServiceNow).
   * Formato `{issueId}_{corner.code}` — issueId ahora viene del contador
   * 'appointment' de issue_sequences (ver TypeOrmAppointmentRepository).
   */
  private buildExternalId(
    issueId: number | null,
    fallbackId: string,
    corner: Corner,
  ): string {
    if (issueId == null) {
      this.logger.warn(
        `[buildExternalId] issueId no disponible para ${fallbackId} — usando UUID como fallback`,
      );
    }
    return `${issueId ?? fallbackId}_${corner.code}`;
  }

  /** Resuelve el sys_id de empresa en SN: perfil asignado → fallback env DEFAULT. */
  private async resolveSnowCompanySysId(
    company: Company,
  ): Promise<string | null> {
    if (!company.profileId) {
      const fallback = process.env.SN_DEFAULT_COMPANY_SYS_ID ?? null;
      this.logger.debug(
        `[company:${company.id}] sin perfil SN — usando fallback company_sys_id: ${fallback ?? 'null'}`,
      );
      return fallback;
    }

    const profileResult = await this.profileRepo.findById(company.profileId);
    if (profileResult.isFailure || !profileResult.unwrap()) {
      const fallback = process.env.SN_DEFAULT_COMPANY_SYS_ID ?? null;
      this.logger.warn(
        `[company:${company.id}] perfil ${company.profileId} no encontrado — usando fallback company_sys_id: ${fallback ?? 'null'}`,
      );
      return fallback;
    }

    const sysId = profileResult.unwrap()!.snowCompanySysId.value;
    this.logger.debug(
      `[company:${company.id}] perfil ${company.profileId} → company_sys_id: ${sysId}`,
    );
    return sysId;
  }

  /**
   * Resuelve el assignment_group para un ticket en ServiceNow.
   *
   * Orden de prioridad:
   *  1. CompanyIssueConfig de la compañía específica + issueType
   *  2. CompanyIssueConfig de la compañía default (SN_DEFAULT_COMPANY_ID) + issueType
   *  3. Grupo del corner (snow_assignment_group)
   */
  private async resolveAssignmentGroup(
    companyId: CompanyId,
    issueTypeId: IssueTypeId,
    cornerGroup: string | null,
  ): Promise<string> {
    const specificResult = await this.companyIssueConfigRepo.getServiceNowGroup(
      companyId,
      issueTypeId,
    );
    if (specificResult.isSuccess && specificResult.unwrap()) {
      return specificResult.unwrap()!;
    }

    const defaultCompanyId = process.env.SN_DEFAULT_COMPANY_ID;
    if (defaultCompanyId && defaultCompanyId !== companyId.toString()) {
      this.logger.debug(
        `[company:${companyId}] sin CompanyIssueConfig para issueType:${issueTypeId} — consultando compañía default (${defaultCompanyId})`,
      );
      const defaultResult =
        await this.companyIssueConfigRepo.getServiceNowGroup(
          defaultCompanyId as CompanyId,
          issueTypeId,
        );
      if (defaultResult.isSuccess && defaultResult.unwrap()) {
        this.logger.debug(
          `[company:${companyId}] assignment_group resuelto desde compañía default → ${defaultResult.unwrap()}`,
        );
        return defaultResult.unwrap()!;
      }
    }

    if (cornerGroup) {
      this.logger.debug(
        `[company:${companyId}] usando grupo del corner → ${cornerGroup}`,
      );
      return cornerGroup;
    }

    this.logger.warn(
      `[company:${companyId}] sin assignment_group para issueType:${issueTypeId} — ni config específica, ni default, ni corner`,
    );
    return 'SOPORTE_GENERAL';
  }

  /**
   * Construye el payload, crea el ticket en ServiceNow (incident o sc_req_item)
   * y devuelve un `ServiceNowTicketLink` (pendiente/resuelto/diferido) listo
   * para persistir. Reemplaza createIncidentTicket/createRequestTicket —
   * la única diferencia entre ambos era la forma del payload, ahora aislada
   * en un solo branch en vez de dos métodos casi-duplicados.
   */
  async createTicket(
    appointment: Appointment,
    ticketType: CreatableTicketType,
    company: Company,
    callerPrincipalName?: string,
    requestedForOrCreatorEmail?: string,
  ): Promise<Result<ServiceNowTicketLink>> {
    return this.tracing.run(
      'monolith.sn.createTicket',
      {
        kind: 'server',
        attributes: {
          'sn.appointmentId': String(appointment.id),
          'sn.ticketType': ticketType,
          'sn.companyId': String(company.id),
        },
      },
      () =>
        this._createTicket(
          appointment,
          ticketType,
          company,
          callerPrincipalName,
          requestedForOrCreatorEmail,
        ),
    );
  }

  private async _createTicket(
    appointment: Appointment,
    ticketType: CreatableTicketType,
    company: Company,
    callerPrincipalName?: string,
    requestedForOrCreatorEmail?: string,
  ): Promise<Result<ServiceNowTicketLink>> {
    const issueTypeResult = await this.issueTypeRepo.findById(
      appointment.issueTypeId,
    );
    if (issueTypeResult.isFailure)
      return Result.err(issueTypeResult.unwrapError());
    const issueType = issueTypeResult.unwrap();
    if (!issueType)
      return Result.err(new IssueTypeNotFoundError(appointment.issueTypeId));

    const cornerResult = await this.cornerRepo.findById(appointment.cornerId);
    if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
    const corner = cornerResult.unwrap();
    if (!corner)
      return Result.err(new Error(`Corner ${appointment.cornerId} not found`));

    const assignmentGroup = await this.resolveAssignmentGroup(
      company.id,
      appointment.issueTypeId,
      corner.snowAssignmentGroup ?? null,
    );
    const snowCompanySysId = await this.resolveSnowCompanySysId(company);
    const externalId = this.buildExternalId(
      appointment.issueId,
      String(appointment.id),
      corner,
    );

    this.logger.log(
      `[appointment:${appointment.id}] → SN | type=${ticketType} | category=${issueType.servicenowCategory?.value ?? '-'} | group=${assignmentGroup} | company=${snowCompanySysId ?? 'null'} | corner=${corner.name}`,
    );

    const snResult =
      ticketType === 'incident'
        ? await this.snClient.createIncident({
            company: snowCompanySysId,
            category: issueType.servicenowCategory?.value ?? '',
            assignment_group: assignmentGroup,
            location: corner.servicenowLocation ?? '',
            short_description: `Incidente: ${issueType.name}`,
            description: `Incidencia creada en corner ${corner.name}`,
            caller_id: callerPrincipalName ?? String(appointment.customerId),
            urgency: issueType.snUrgency.value,
            impact: issueType.snImpact.value,
            severity: issueType.snSeverity.value,
            expected_start: appointment.scheduledRange.start,
            externalId,
            // Si un técnico crea la cita, va como assigned_to; si no, el default.
            assigned_to:
              requestedForOrCreatorEmail ??
              process.env.SN_DEFAULT_TECHNICIAN ??
              undefined,
          })
        : await this.snClient.createRequest({
            company: snowCompanySysId,
            category: issueType.servicenowCategory?.value ?? '',
            assignment_group: assignmentGroup,
            location: corner.servicenowLocation ?? '',
            short_description: `Solicitud: ${issueType.name}`,
            description:
              appointment.metadata?.notes ?? 'Solicitud creada por técnico',
            caller_id:
              callerPrincipalName ??
              String(appointment.createdByTechnicianId ?? appointment.customerId),
            requested_for:
              requestedForOrCreatorEmail ?? String(appointment.customerId),
            externalId,
          });

    if (snResult.isFailure) {
      this.logger.error(
        `[appointment:${appointment.id}] SN ${ticketType === 'incident' ? 'createIncident' : 'createRequest'} falló: ${snResult.unwrapError().message}`,
      );
      return Result.err(snResult.unwrapError());
    }

    const linkResult = ServiceNowTicketLink.createPending(
      crypto.randomUUID(),
      appointment.id,
      ticketType,
      'primary',
    );
    if (linkResult.isFailure) return Result.err(linkResult.unwrapError());
    const link = linkResult.unwrap();

    const { sysId, number, deferred, correlationId } = snResult.unwrap();

    if (deferred && correlationId) {
      link.markDeferred(correlationId);
      this.logger.log(
        `[appointment:${appointment.id}] modo ASYNC — correlationId: ${correlationId}`,
      );
    } else {
      const sysIdResult = ServiceNowId.create(sysId);
      const numResult = ServiceNowNumber.create(number);

      if (sysIdResult.isFailure || numResult.isFailure) {
        this.logger.error(
          `[appointment:${appointment.id}] SN devolvió ID/Number inválidos — sysId=${sysId} number=${number}`,
        );
        return Result.err(
          new Error(
            `ServiceNow returned invalid sys_id or number: sysId=${sysId} number=${number}`,
          ),
        );
      }

      link.resolveImmediate(sysIdResult.unwrap(), numResult.unwrap());
      this.logger.log(
        `[appointment:${appointment.id}] modo INMEDIATO — number: ${number} | sysId: ${sysId}`,
      );
    }

    return Result.ok(link);
  }

  /**
   * Re-encola un ticket huérfano en snowq (async only, sin intento inmediato).
   * El ReconcilerJob obtendrá sysId + number cuando snowq lo procese, sin
   * forzar un nuevo ticket. Reemplaza reQueueIncidentTicket/reQueueRequestTicket.
   */
  async reQueueTicket(
    appointment: Appointment,
    ticketLink: ServiceNowTicketLink,
    company: Company,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.reQueueTicket',
      {
        kind: 'server',
        attributes: {
          'sn.appointmentId': String(appointment.id),
          'sn.ticketType': ticketLink.type,
        },
      },
      () => this._reQueueTicket(appointment, ticketLink, company),
    );
  }

  private async _reQueueTicket(
    appointment: Appointment,
    ticketLink: ServiceNowTicketLink,
    company: Company,
  ): Promise<Result<void>> {
    if (ticketLink.type === 'sc_task') {
      return Result.err(new Error('sc_task tickets are not re-queueable — no creation endpoint exists for them yet'));
    }

    const issueTypeResult = await this.issueTypeRepo.findById(appointment.issueTypeId);
    if (issueTypeResult.isFailure) return Result.err(issueTypeResult.unwrapError());
    const issueType = issueTypeResult.unwrap();
    if (!issueType) return Result.err(new IssueTypeNotFoundError(appointment.issueTypeId));

    const cornerResult = await this.cornerRepo.findById(appointment.cornerId);
    if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
    const corner = cornerResult.unwrap();
    if (!corner) return Result.err(new Error(`Corner ${appointment.cornerId} not found`));

    const assignmentGroup = await this.resolveAssignmentGroup(
      company.id,
      appointment.issueTypeId,
      corner.snowAssignmentGroup ?? null,
    );
    const snowCompanySysId = await this.resolveSnowCompanySysId(company);
    const externalId = this.buildExternalId(appointment.issueId, String(appointment.id), corner);

    this.logger.log(
      `[appointment:${appointment.id}] re-enqueue → SN async | type=${ticketLink.type} | group=${assignmentGroup} | company=${snowCompanySysId ?? 'null'}`,
    );

    const enqueueResult =
      ticketLink.type === 'incident'
        ? await this.snClient.enqueueIncident({
            company: snowCompanySysId,
            category: issueType.servicenowCategory?.value ?? '',
            assignment_group: assignmentGroup,
            location: corner.servicenowLocation ?? '',
            short_description: `Incidente: ${issueType.name}`,
            description: `Incidencia creada en corner ${corner.name}`,
            caller_id: String(appointment.customerId),
            urgency: issueType.snUrgency.value,
            impact: issueType.snImpact.value,
            severity: issueType.snSeverity.value,
            expected_start: appointment.scheduledRange.start,
            externalId,
            assigned_to: process.env.SN_DEFAULT_TECHNICIAN ?? undefined,
          })
        : await this.snClient.enqueueRequest({
            company: snowCompanySysId,
            category: issueType.servicenowCategory?.value ?? '',
            assignment_group: assignmentGroup,
            location: corner.servicenowLocation ?? '',
            short_description: `Solicitud: ${issueType.name}`,
            description: appointment.metadata?.notes ?? 'Solicitud creada por técnico',
            caller_id: String(appointment.createdByTechnicianId ?? appointment.customerId),
            requested_for: String(appointment.customerId),
            externalId,
          });

    if (enqueueResult.isFailure) {
      this.logger.error(
        `[appointment:${appointment.id}] re-enqueue falló: ${enqueueResult.unwrapError().message}`,
      );
      return Result.err(enqueueResult.unwrapError());
    }

    const { correlationId } = enqueueResult.unwrap();
    ticketLink.markDeferred(correlationId);
    this.logger.log(
      `[appointment:${appointment.id}] re-enqueued → correlationId: ${correlationId}`,
    );
    return Result.ok(undefined);
  }

  /** Cierra cualquier tipo de ticket en ServiceNow. Reemplaza closeIncidentTicket (incident-only). */
  async closeTicket(
    ticketLink: ServiceNowTicketLink,
    closeCategory: string,
    closeNotes?: string,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.closeTicket',
      {
        kind: 'server',
        attributes: { 'sn.type': ticketLink.type, 'sn.closeCategory': closeCategory },
      },
      () => this._closeTicket(ticketLink, closeCategory, closeNotes),
    );
  }

  private async _closeTicket(
    ticketLink: ServiceNowTicketLink,
    closeCategory: string,
    closeNotes?: string,
  ): Promise<Result<void>> {
    if (!ticketLink.sysId) {
      return Result.err(new Error(`ServiceNowTicketLink ${ticketLink.id} has no sysId yet`));
    }
    this.logger.log(
      `[close] type=${ticketLink.type} | sysId=${ticketLink.sysId.value} | closeCategory=${closeCategory}`,
    );
    const result = await this.snClient.closeTicket(
      ticketLink.type,
      ticketLink.sysId.value,
      closeCategory,
      closeNotes,
    );
    if (result.isFailure) {
      this.logger.error(
        `[close] falló para ${ticketLink.type}/${ticketLink.sysId.value}: ${result.unwrapError().message}`,
      );
    }
    return result;
  }

  /** Actualiza campos arbitrarios de un ticket existente (ya era genérico por tabla). */
  async updateTicket(
    table: string,
    sysId: string,
    fields: Record<string, any>,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.updateTicket',
      { kind: 'server', attributes: { 'sn.table': table, 'sn.sysId': sysId } },
      () => this._updateTicket(table, sysId, fields),
    );
  }

  private async _updateTicket(
    table: string,
    sysId: string,
    fields: Record<string, any>,
  ): Promise<Result<void>> {
    this.logger.log(
      `[update] table=${table} | sysId=${sysId} | fields=${Object.keys(fields).join(',')}`,
    );
    const result = await this.snClient.updateTicket(table, sysId, fields);
    if (result.isFailure) {
      this.logger.error(
        `[update] falló para ${table}/${sysId}: ${result.unwrapError().message}`,
      );
    }
    return result;
  }
}
