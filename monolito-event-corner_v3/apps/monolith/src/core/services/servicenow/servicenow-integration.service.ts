// core/services/servicenow/servicenow-integration.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { TracingService } from '@app/observability';
import { IIssueTypeRepository } from '../../ports/outgoing/repositories/issue-type-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { IServiceNowProfileRepository } from '../../ports/outgoing/repositories/servicenow-profile-repository.port';
import { ICompanyIssueConfigRepository } from '../../ports/outgoing/repositories/corner-issue-config-repository.port';
import { IServiceNowClient } from '../../ports/outgoing/servicenow/servicenow-client.port';
import { Incident } from '../../domain/entities/incident.entity';
import { Request } from '../../domain/entities/request.entity';
import { Company } from '../../domain/entities/company.entity';
import { IssueTypeNotFoundError } from '../../domain/errors/incident.errors';
import { ServiceNowId } from '../../domain/value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../../domain/value-objects/servicenow-number.value';
import { CompanyId, IssueTypeId } from '@app/shared/types/branded-ids';
import { Result } from '@app/result';

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

  /** Construye el payload, crea el ticket de Incident en ServiceNow y actualiza la entidad. */
  async createIncidentTicket(
    incident: Incident,
    company: Company,
    callerPrincipalName?: string,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.createIncidentTicket',
      {
        kind: 'server',
        attributes: {
          'sn.incidentId': String(incident.id),
          'sn.companyId': String(company.id),
        },
      },
      () => this._createIncidentTicket(incident, company, callerPrincipalName),
    );
  }

  private async _createIncidentTicket(
    incident: Incident,
    company: Company,
    callerPrincipalName?: string,
  ): Promise<Result<void>> {
    const issueTypeResult = await this.issueTypeRepo.findById(
      incident.issueTypeId,
    );
    if (issueTypeResult.isFailure)
      return Result.err(issueTypeResult.unwrapError());
    const issueType = issueTypeResult.unwrap();
    if (!issueType)
      return Result.err(new IssueTypeNotFoundError(incident.issueTypeId));

    const cornerResult = await this.cornerRepo.findById(incident.cornerId);
    if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
    const corner = cornerResult.unwrap();
    if (!corner)
      return Result.err(new Error(`Corner ${incident.cornerId} not found`));

    const assignmentGroup = await this.resolveAssignmentGroup(
      company.id,
      incident.issueTypeId,
      corner.snowAssignmentGroup ?? null,
    );
    const snowCompanySysId = await this.resolveSnowCompanySysId(company);

    this.logger.log(
      `[incident:${incident.id}] → SN | category=${issueType.servicenowCategory?.value ?? '-'} | group=${assignmentGroup} | company=${snowCompanySysId ?? 'null'} | caller=${incident.customerId} | corner=${corner.name}`,
    );

    const snResult = await this.snClient.createIncident({
      company: snowCompanySysId,
      category: issueType.servicenowCategory?.value ?? '',
      assignment_group: assignmentGroup,
      location: corner.servicenowLocation ?? '',
      short_description: `Incidente: ${issueType.name}`,
      description: `Incidencia creada en corner ${corner.name}`,
      caller_id: callerPrincipalName ?? String(incident.customerId),
      urgency: issueType.snUrgency.value,
      impact: issueType.snImpact.value,
      severity: issueType.snSeverity.value,
      expected_start: incident.scheduledRange.start,
      externalId: String(incident.id),
    });

    if (snResult.isFailure) {
      this.logger.error(
        `[incident:${incident.id}] SN createIncident falló: ${snResult.unwrapError().message}`,
      );
      return Result.err(snResult.unwrapError());
    }

    const { sysId, number, deferred, correlationId } = snResult.unwrap();

    if (deferred && correlationId) {
      incident.setSnowqCorrelationId(correlationId);
      this.logger.log(
        `[incident:${incident.id}] modo ASYNC — correlationId: ${correlationId}`,
      );
    } else {
      const sysIdResult = ServiceNowId.create(sysId);
      const numResult = ServiceNowNumber.create(number);

      if (sysIdResult.isFailure || numResult.isFailure) {
        this.logger.error(
          `[incident:${incident.id}] SN devolvió ID/Number inválidos — sysId=${sysId} number=${number}`,
        );
        return Result.err(
          new Error(
            `ServiceNow returned invalid sys_id or number: sysId=${sysId} number=${number}`,
          ),
        );
      }

      incident.updateServiceNowInfo(sysIdResult.unwrap(), numResult.unwrap());
      this.logger.log(
        `[incident:${incident.id}] modo INMEDIATO — number: ${number} | sysId: ${sysId}`,
      );
    }

    return Result.ok(undefined);
  }

  /** Construye el payload, crea el ticket de Request en ServiceNow y actualiza la entidad. */
  async createRequestTicket(
    request: Request,
    company: Company,
    callerPrincipalName?: string,
    requestedForPrincipalName?: string,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.createRequestTicket',
      {
        kind: 'server',
        attributes: {
          'sn.requestId': String(request.id),
          'sn.companyId': String(company.id),
        },
      },
      () =>
        this._createRequestTicket(
          request,
          company,
          callerPrincipalName,
          requestedForPrincipalName,
        ),
    );
  }

  private async _createRequestTicket(
    request: Request,
    company: Company,
    callerPrincipalName?: string,
    requestedForPrincipalName?: string,
  ): Promise<Result<void>> {
    const issueTypeResult = await this.issueTypeRepo.findById(
      request.issueTypeId,
    );
    if (issueTypeResult.isFailure)
      return Result.err(issueTypeResult.unwrapError());
    const issueType = issueTypeResult.unwrap();
    if (!issueType)
      return Result.err(new IssueTypeNotFoundError(request.issueTypeId));

    const cornerResult = await this.cornerRepo.findById(request.cornerId);
    if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
    const corner = cornerResult.unwrap();
    if (!corner)
      return Result.err(new Error(`Corner ${request.cornerId} not found`));

    const assignmentGroup = await this.resolveAssignmentGroup(
      company.id,
      request.issueTypeId,
      corner.snowAssignmentGroup ?? null,
    );
    const snowCompanySysId = await this.resolveSnowCompanySysId(company);

    this.logger.log(
      `[request:${request.id}] → SN | category=${issueType.servicenowCategory?.value ?? '-'} | group=${assignmentGroup} | company=${snowCompanySysId ?? 'null'} | caller=${request.technicianId} | for=${request.customerId}`,
    );

    const snResult = await this.snClient.createRequest({
      company: snowCompanySysId,
      category: issueType.servicenowCategory?.value ?? '',
      assignment_group: assignmentGroup,
      location: corner.servicenowLocation ?? '',
      short_description: `Solicitud: ${issueType.name}`,
      description: request.notes ?? 'Solicitud creada por técnico',
      caller_id: callerPrincipalName ?? String(request.technicianId),
      requested_for: requestedForPrincipalName ?? String(request.customerId),
      externalId: String(request.id),
    });

    if (snResult.isFailure) {
      this.logger.error(
        `[request:${request.id}] SN createRequest falló: ${snResult.unwrapError().message}`,
      );
      return Result.err(snResult.unwrapError());
    }

    const { sysId, number, deferred, correlationId } = snResult.unwrap();

    if (deferred && correlationId) {
      request.setSnowqCorrelationId(correlationId);
      this.logger.log(
        `[request:${request.id}] modo ASYNC — correlationId: ${correlationId}`,
      );
    } else {
      const sysIdResult = ServiceNowId.create(sysId);
      const numResult = ServiceNowNumber.create(number);

      if (sysIdResult.isFailure || numResult.isFailure) {
        this.logger.error(
          `[request:${request.id}] SN devolvió ID/Number inválidos — sysId=${sysId} number=${number}`,
        );
        return Result.err(
          new Error(
            `ServiceNow returned invalid sys_id or number: sysId=${sysId} number=${number}`,
          ),
        );
      }

      request.updateServiceNowInfo(sysIdResult.unwrap(), numResult.unwrap());
      this.logger.log(
        `[request:${request.id}] modo INMEDIATO — number: ${number} | sysId: ${sysId}`,
      );
    }

    return Result.ok(undefined);
  }

  /**
   * Re-encola un incident huérfano en snowq (async only, sin intento inmediato).
   * Usar en lugar de createIncidentTicket para recuperación: el ReconcilerJob
   * obtendrá sysId + number cuando snowq lo procese sin forzar un nuevo ticket.
   */
  async reQueueIncidentTicket(
    incident: Incident,
    company: Company,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.reQueueIncidentTicket',
      {
        kind: 'server',
        attributes: {
          'sn.incidentId': String(incident.id),
          'sn.companyId': String(company.id),
        },
      },
      () => this._reQueueIncidentTicket(incident, company),
    );
  }

  private async _reQueueIncidentTicket(
    incident: Incident,
    company: Company,
  ): Promise<Result<void>> {
    const issueTypeResult = await this.issueTypeRepo.findById(
      incident.issueTypeId,
    );
    if (issueTypeResult.isFailure)
      return Result.err(issueTypeResult.unwrapError());
    const issueType = issueTypeResult.unwrap();
    if (!issueType)
      return Result.err(new IssueTypeNotFoundError(incident.issueTypeId));

    const cornerResult = await this.cornerRepo.findById(incident.cornerId);
    if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
    const corner = cornerResult.unwrap();
    if (!corner)
      return Result.err(new Error(`Corner ${incident.cornerId} not found`));

    const assignmentGroup = await this.resolveAssignmentGroup(
      company.id,
      incident.issueTypeId,
      corner.snowAssignmentGroup ?? null,
    );
    const snowCompanySysId = await this.resolveSnowCompanySysId(company);

    this.logger.log(
      `[incident:${incident.id}] re-enqueue → SN async | group=${assignmentGroup} | company=${snowCompanySysId ?? 'null'}`,
    );

    const enqueueResult = await this.snClient.enqueueIncident({
      company: snowCompanySysId,
      category: issueType.servicenowCategory?.value ?? '',
      assignment_group: assignmentGroup,
      location: corner.servicenowLocation ?? '',
      short_description: `Incidente: ${issueType.name}`,
      description: `Incidencia creada en corner ${corner.name}`,
      caller_id: String(incident.customerId),
      urgency: issueType.snUrgency.value,
      impact: issueType.snImpact.value,
      severity: issueType.snSeverity.value,
      expected_start: incident.scheduledRange.start,
      externalId: String(incident.id),
    });

    if (enqueueResult.isFailure) {
      this.logger.error(
        `[incident:${incident.id}] re-enqueue falló: ${enqueueResult.unwrapError().message}`,
      );
      return Result.err(enqueueResult.unwrapError());
    }

    const { correlationId } = enqueueResult.unwrap();
    incident.setSnowqCorrelationId(correlationId);
    this.logger.log(
      `[incident:${incident.id}] re-enqueued → correlationId: ${correlationId}`,
    );
    return Result.ok(undefined);
  }

  /**
   * Re-encola una request huérfana en snowq (async only, sin intento inmediato).
   */
  async reQueueRequestTicket(
    request: Request,
    company: Company,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.reQueueRequestTicket',
      {
        kind: 'server',
        attributes: {
          'sn.requestId': String(request.id),
          'sn.companyId': String(company.id),
        },
      },
      () => this._reQueueRequestTicket(request, company),
    );
  }

  private async _reQueueRequestTicket(
    request: Request,
    company: Company,
  ): Promise<Result<void>> {
    const issueTypeResult = await this.issueTypeRepo.findById(
      request.issueTypeId,
    );
    if (issueTypeResult.isFailure)
      return Result.err(issueTypeResult.unwrapError());
    const issueType = issueTypeResult.unwrap();
    if (!issueType)
      return Result.err(new IssueTypeNotFoundError(request.issueTypeId));

    const cornerResult = await this.cornerRepo.findById(request.cornerId);
    if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
    const corner = cornerResult.unwrap();
    if (!corner)
      return Result.err(new Error(`Corner ${request.cornerId} not found`));

    const assignmentGroup = await this.resolveAssignmentGroup(
      company.id,
      request.issueTypeId,
      corner.snowAssignmentGroup ?? null,
    );
    const snowCompanySysId = await this.resolveSnowCompanySysId(company);

    this.logger.log(
      `[request:${request.id}] re-enqueue → SN async | group=${assignmentGroup} | company=${snowCompanySysId ?? 'null'}`,
    );

    const enqueueResult = await this.snClient.enqueueRequest({
      company: snowCompanySysId,
      category: issueType.servicenowCategory?.value ?? '',
      assignment_group: assignmentGroup,
      location: corner.servicenowLocation ?? '',
      short_description: `Solicitud: ${issueType.name}`,
      description: request.notes ?? 'Solicitud creada por técnico',
      caller_id: String(request.technicianId),
      requested_for: String(request.customerId),
      externalId: String(request.id),
    });

    if (enqueueResult.isFailure) {
      this.logger.error(
        `[request:${request.id}] re-enqueue falló: ${enqueueResult.unwrapError().message}`,
      );
      return Result.err(enqueueResult.unwrapError());
    }

    const { correlationId } = enqueueResult.unwrap();
    request.setSnowqCorrelationId(correlationId);
    this.logger.log(
      `[request:${request.id}] re-enqueued → correlationId: ${correlationId}`,
    );
    return Result.ok(undefined);
  }

  /** Cierra un ticket de Incident en ServiceNow. */
  async closeIncidentTicket(
    sysId: string,
    closeCategory: string,
    closeNotes?: string,
  ): Promise<Result<void>> {
    return this.tracing.run(
      'monolith.sn.closeIncidentTicket',
      {
        kind: 'server',
        attributes: { 'sn.sysId': sysId, 'sn.closeCategory': closeCategory },
      },
      () => this._closeIncidentTicket(sysId, closeCategory, closeNotes),
    );
  }

  private async _closeIncidentTicket(
    sysId: string,
    closeCategory: string,
    closeNotes?: string,
  ): Promise<Result<void>> {
    this.logger.log(`[close] sysId=${sysId} | closeCategory=${closeCategory}`);
    const result = await this.snClient.closeIncident(
      sysId,
      closeCategory,
      closeNotes,
    );
    if (result.isFailure) {
      this.logger.error(
        `[close] falló para sysId=${sysId}: ${result.unwrapError().message}`,
      );
    }
    return result;
  }

  /** Actualiza campos arbitrarios de un ticket existente. */
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
    // 1. Config específica de la compañía
    const specificResult = await this.companyIssueConfigRepo.getServiceNowGroup(
      companyId,
      issueTypeId,
    );
    if (specificResult.isSuccess && specificResult.unwrap()) {
      return specificResult.unwrap()!;
    }

    // 2. Config de la compañía default
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

    // 3. Grupo del corner
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
}
