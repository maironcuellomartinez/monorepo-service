// core/services/servicenow/servicenow-integration.service.spec.ts
import { ServiceNowIntegrationService } from './servicenow-integration.service';
import { Result } from '@app/result';
import { Incident } from '../../domain/entities/incident.entity';
import { IssueType } from '../../domain/entities/issue-type.entity';
import { Corner } from '../../domain/entities/corner.entity';
import { Company } from '../../domain/entities/company.entity';
import {
  IncidentId,
  IssueTypeId,
  CustomerId,
  CornerId,
  CompanyId,
} from '@app/shared/types/branded-ids';
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

function fakeIncident(): Incident {
  return {
    id: IncidentId('inc-1'),
    issueId: 1526,
    issueTypeId: IssueTypeId('issue-1'),
    cornerId: CornerId('corner-1'),
    customerId: CustomerId('cust-1'),
    scheduledRange: { start: new Date('2026-08-01T10:00:00.000Z') },
    setSnowqCorrelationId: jest.fn(),
    updateServiceNowInfo: jest.fn(),
  } as unknown as Incident;
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
  it('createIncidentTicket envía urgency/impact/severity del IssueType', async () => {
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

    const result = await service.createIncidentTicket(
      fakeIncident(),
      fakeCompany(),
      'user@corp.com',
    );

    expect(result.isSuccess).toBe(true);
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

  it('reQueueIncidentTicket (recuperación) también envía la clasificación', async () => {
    const enqueueIncident = jest
      .fn()
      .mockResolvedValue(Result.ok({ correlationId: 'corr-2' }));
    const service = buildService({
      issueType: fakeIssueType({ urgency: 3, impact: 2, severity: 'low' }),
      snClient: { enqueueIncident },
    });

    const result = await service.reQueueIncidentTicket(
      fakeIncident(),
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

  it('createIncidentTicket cae al UUID si issueId aún no fue asignado por la DB', async () => {
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

    const incidentWithoutIssueId = { ...fakeIncident(), issueId: null };

    const result = await service.createIncidentTicket(
      incidentWithoutIssueId as unknown as Incident,
      fakeCompany(),
    );

    expect(result.isSuccess).toBe(true);
    expect(createIncident).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'inc-1_corner_a' }),
    );
  });
});
