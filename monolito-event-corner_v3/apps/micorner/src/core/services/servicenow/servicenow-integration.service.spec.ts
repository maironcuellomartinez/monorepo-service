// core/services/servicenow/servicenow-integration.service.spec.ts
import { ServiceNowIntegrationService } from './servicenow-integration.service';
import { Result } from '@app/result';
import { Appointment } from '../../domain/entities/appointment.entity';
import { IssueType } from '../../domain/entities/issue-type.entity';
import { Corner } from '../../domain/entities/corner.entity';
import { Company } from '../../domain/entities/company.entity';
import {
  AppointmentId,
  IssueTypeId,
  CustomerId,
  CornerId,
  CompanyId,
} from '@app/shared/types/branded-ids';
import { AppointmentKind } from '../../domain/enums/appointment-kind.enum';
import { ServiceNowTicketLink } from '../../domain/entities/servicenow-ticket-link.entity';
import { TracingService } from '@app/observability';

// Tracing: ejecuta el callback sin instrumentar (patrón usado en los otros specs).
const tracing = {
  run: (_n: string, _o: unknown, fn: () => unknown) => fn(),
} as unknown as TracingService;

// Fakes mínimos: el service solo lee getters puntuales de cada entidad.
function fakeIssueType(sn: {
  urgency: number;
  impact: number;
  severity: string;
}): IssueType {
  return {
    name: 'Teclado / Mouse',
    servicenowCategory: { value: 'hardware' },
    snUrgency: { value: sn.urgency },
    snImpact: { value: sn.impact },
    snSeverity: { value: sn.severity },
  } as unknown as IssueType;
}

function fakeCorner(): Corner {
  return {
    id: CornerId('corner-1'),
    name: 'Corner A',
    code: 'corner_a',
    snowAssignmentGroup: 'GRUPO_X',
    servicenowLocation: 'LOC-1',
  } as unknown as Corner;
}

function fakeCompany(): Company {
  // Sin profileId → resolveSnowCompanySysId cae al fallback de env (null aquí).
  return { id: CompanyId('comp-1'), profileId: null } as unknown as Company;
}

function fakeAppointment(): Appointment {
  return {
    id: AppointmentId('apt-1'),
    issueId: 1526,
    issueTypeId: IssueTypeId('issue-1'),
    cornerId: CornerId('corner-1'),
    customerId: CustomerId('cust-1'),
    companyId: CompanyId('comp-1'),
    kind: AppointmentKind.ISSUE,
    createdByTechnicianId: null,
    metadata: {},
    scheduledRange: { start: new Date('2026-08-01T10:00:00.000Z') },
  } as unknown as Appointment;
}

function buildService(overrides: {
  issueType: IssueType;
  snClient: { createIncident?: jest.Mock; enqueueIncident?: jest.Mock };
}) {
  const issueTypeRepo = {
    findById: jest.fn().mockResolvedValue(Result.ok(overrides.issueType)),
  };
  const cornerRepo = {
    findById: jest.fn().mockResolvedValue(Result.ok(fakeCorner())),
  };
  const profileRepo = { findById: jest.fn() };
  const companyIssueConfigRepo = {
    getServiceNowGroup: jest.fn().mockResolvedValue(Result.ok(null)),
  };

  const service = new ServiceNowIntegrationService(
    issueTypeRepo as any,
    cornerRepo as any,
    profileRepo as any,
    overrides.snClient as any,
    companyIssueConfigRepo as any,
    tracing,
  );
  return service;
}

describe('ServiceNowIntegrationService — clasificación SN desde IssueType', () => {
  it('createTicket(incident) envía urgency/impact/severity del IssueType', async () => {
    const createIncident = jest.fn().mockResolvedValue(
      Result.ok({
        sysId: '',
        number: '',
        deferred: true,
        correlationId: 'corr-1',
      }),
    );
    const service = buildService({
      issueType: fakeIssueType({ urgency: 1, impact: 1, severity: 'high' }),
      snClient: { createIncident },
    });

    const result = await service.createTicket(
      fakeAppointment(),
      'incident',
      fakeCompany(),
      'user@corp.com',
    );

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().type).toBe('incident');
    expect(result.unwrap().snowqCorrelationId).toBe('corr-1');
    expect(createIncident).toHaveBeenCalledTimes(1);
    expect(createIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        urgency: 1,
        impact: 1,
        severity: 'high',
        externalId: '1526_corner_a',
      }),
    );
  });

  it('reQueueTicket (recuperación) también envía la clasificación', async () => {
    const enqueueIncident = jest
      .fn()
      .mockResolvedValue(Result.ok({ correlationId: 'corr-2' }));
    const service = buildService({
      issueType: fakeIssueType({ urgency: 3, impact: 2, severity: 'low' }),
      snClient: { enqueueIncident },
    });

    const linkResult = ServiceNowTicketLink.createPending(
      'link-1',
      AppointmentId('apt-1'),
      'incident',
      'primary',
    );
    const link = linkResult.unwrap();

    const result = await service.reQueueTicket(
      fakeAppointment(),
      link,
      fakeCompany(),
    );

    expect(result.isSuccess).toBe(true);
    expect(enqueueIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        urgency: 3,
        impact: 2,
        severity: 'low',
        externalId: '1526_corner_a',
      }),
    );
  });

  it('createTicket cae al UUID si issueId aún no fue asignado por la DB', async () => {
    const createIncident = jest.fn().mockResolvedValue(
      Result.ok({
        sysId: '',
        number: '',
        deferred: true,
        correlationId: 'corr-3',
      }),
    );
    const service = buildService({
      issueType: fakeIssueType({ urgency: 2, impact: 2, severity: 'medium' }),
      snClient: { createIncident },
    });

    const appointmentWithoutIssueId = { ...fakeAppointment(), issueId: null };

    const result = await service.createTicket(
      appointmentWithoutIssueId as unknown as Appointment,
      'incident',
      fakeCompany(),
    );

    expect(result.isSuccess).toBe(true);
    expect(createIncident).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'apt-1_corner_a' }),
    );
  });
});
