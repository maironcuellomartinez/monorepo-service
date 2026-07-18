// core/services/incident/incident.service.spec.ts
import { IncidentService } from './incident.service';
import { Incident } from '../../domain/entities/incident.entity';
import { IncidentStatus } from '../../domain/enums/incident-status.enum';
import { IncidentOrigin } from '../../domain/enums/incident-origin.enum';
import { DateRange } from '../../domain/value-objects/date-range.value';
import { Result } from '@app/result';
import {
  IncidentId,
  IssueTypeId,
  CustomerId,
  CornerId,
  SlotId,
  TechnicianId,
} from '@app/shared/types/branded-ids';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function futureRange(offsetMin = 60, durationMin = 60): DateRange {
  const start = new Date(Date.now() + offsetMin * 60_000);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return DateRange.reconstitute(start, end);
}

function pastRange(): DateRange {
  const end = new Date(Date.now() - 60_000);
  const start = new Date(end.getTime() - 60 * 60_000);
  return DateRange.reconstitute(start, end);
}

function makeIncident(status?: IncidentStatus): Incident {
  const incident = Incident.create(
    IncidentId('inc-1'),
    IssueTypeId('issue-1'),
    CustomerId('cust-1'),
    CornerId('corner-1'),
    [SlotId('slot-1')],
    futureRange(),
    IncidentOrigin.CUSTOMER_APP,
  ).unwrap();

  if (!status || status === IncidentStatus.CREATED) return incident;

  const tech = TechnicianId('tech-1');

  // Helpers para navegar la máquina de estados real:
  // CREATED → DELIVERED → IN_PROGRESS → PENDING_PICKUP → CLOSED
  const toDelivered = () => incident.deliver(tech);
  const toInProgress = () => {
    toDelivered();
    incident.changeStatus(IncidentStatus.IN_PROGRESS, tech);
  };
  const toClosed = () => {
    toInProgress();
    incident.changeStatus(IncidentStatus.PENDING_PICKUP, tech);
    incident.changeStatus(IncidentStatus.CLOSED, tech);
  };

  switch (status) {
    case IncidentStatus.DELIVERED:
      toDelivered();
      break;
    case IncidentStatus.IN_PROGRESS:
      toInProgress();
      break;
    case IncidentStatus.PENDING_THIRD_PARTY:
      toInProgress();
      incident.changeStatus(IncidentStatus.PENDING_THIRD_PARTY, tech);
      break;
    case IncidentStatus.CLOSED:
      toClosed();
      break;
    case IncidentStatus.VALIDATED:
      toClosed();
      incident.validate();
      break;
    case IncidentStatus.REOPENED:
      toClosed();
      incident.reopen();
      break;
    case IncidentStatus.CANCELED:
      incident.changeStatus(IncidentStatus.CANCELED, tech);
      break;
  }

  return incident;
}

function makeSlotMock(id: string, range?: DateRange) {
  const r = range ?? futureRange();
  return {
    id: SlotId(id),
    isAvailable: jest.fn().mockReturnValue(true),
    isAvailableForUser: jest.fn().mockReturnValue(true),
    book: jest.fn().mockReturnValue(Result.ok(undefined)),
    expire: jest.fn(),
    release: jest.fn().mockReturnValue(Result.ok(undefined)),
    timeRange: { start: r.start, end: r.end },
  };
}

function buildMocks(opts?: {
  incident?: Incident | null;
  slots?: ReturnType<typeof makeSlotMock>[];
  saveFails?: boolean;
  slotsUnavailable?: boolean;
  bookManyAffected?: number;
}) {
  const incident =
    opts?.incident !== undefined ? opts.incident : makeIncident();
  const slots = opts?.slots ?? [makeSlotMock('slot-1')];
  if (opts?.slotsUnavailable)
    slots.forEach((s) => {
      s.isAvailable.mockReturnValue(false);
      s.isAvailableForUser.mockReturnValue(false);
    });

  const affected = opts?.bookManyAffected ?? slots.length;

  const incidentRepository = {
    findById: jest.fn().mockResolvedValue(Result.ok(incident)),
    save: jest
      .fn()
      .mockResolvedValue(
        opts?.saveFails
          ? Result.err(new Error('DB error'))
          : Result.ok(undefined),
      ),
    saveEvents: jest.fn().mockResolvedValue(undefined),
    findAvailable: jest.fn().mockResolvedValue(Result.ok([])),
    findByTechnician: jest.fn().mockResolvedValue(Result.ok([])),
    findByDateRange: jest.fn().mockResolvedValue(Result.ok([])),
  };

  const slotRepository = {
    findManyByIds: jest.fn().mockResolvedValue(Result.ok(slots)),
    findByCornerAndDateRange: jest.fn().mockResolvedValue(Result.ok(slots)),
    updateMany: jest.fn().mockResolvedValue(Result.ok(undefined)),
    bookManyAtomic: jest.fn().mockResolvedValue(Result.ok(affected)),
  };

  const userRepository = {
    findById: jest.fn().mockResolvedValue(
      Result.ok({
        id: CustomerId('cust-1'),
        companyId: 'company-1',
      }),
    ),
  };

  const companyRepository = {
    findById: jest.fn().mockResolvedValue(
      Result.ok({
        id: 'company-1',
        treeId: 'tree-1',
      }),
    ),
  };

  const issueTypeRepository = {
    findById: jest.fn().mockResolvedValue(
      Result.ok({
        id: IssueTypeId('issue-1'),
        treeId: 'tree-1',
      }),
    ),
  };

  const deviceService = {
    resolveAndLinkDevice: jest.fn().mockResolvedValue(
      Result.ok({
        id: 'device-1',
      }),
    ),
  };

  const eventBus = { publishMany: jest.fn().mockResolvedValue(undefined) };
  const cache = {
    deletePattern: jest.fn().mockResolvedValue(Result.ok(undefined)),
  };
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const tracing = {
    run: jest
      .fn()
      .mockImplementation((_name: any, _opts: any, fn: any) => fn()),
  };

  const service = new IncidentService(
    incidentRepository as any,
    slotRepository as any,
    {} as any, // technicianRepository (not used in createIncident)
    {} as any, // cornerRepository
    userRepository as any,
    companyRepository as any,
    issueTypeRepository as any,
    eventBus as any,
    cache as any,
    logger as any,
    tracing as any,
    deviceService as any,
  );

  return {
    service,
    incidentRepository,
    slotRepository: slotRepository as any,
    userRepository,
    companyRepository,
    issueTypeRepository,
    deviceService,
    eventBus,
    cache,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IncidentService.createIncident()', () => {
  const baseCommand = {
    issueTypeId: IssueTypeId('issue-1'),
    customerId: CustomerId('cust-1'),
    cornerId: CornerId('corner-1'),
    slotIds: [SlotId('slot-1')],
    origin: 'CUSTOMER_APP',
    device: { serialNumber: 'SN-001' },
  };

  it('crea una incidencia, guarda y publica eventos', async () => {
    const { service, incidentRepository, eventBus, cache } = buildMocks();

    const result = await service.createIncident(baseCommand);

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(IncidentStatus.CREATED);
    expect(incidentRepository.save).toHaveBeenCalledTimes(1);
    expect(eventBus.publishMany).toHaveBeenCalledTimes(1);
    expect(cache.deletePattern).toHaveBeenCalledTimes(1);
  });

  it('invalida el caché con la clave correcta de disponibilidad', async () => {
    const slot = makeSlotMock('slot-1');
    const { service, cache } = buildMocks({ slots: [slot] });
    const dateStr = slot.timeRange.start.toISOString().split('T')[0];

    await service.createIncident(baseCommand);

    expect(cache.deletePattern).toHaveBeenCalledWith(
      `availability:corner-1:${dateStr}:*`,
    );
  });

  it('falla si un slot no existe en el repositorio', async () => {
    const { service, slotRepository } = buildMocks();
    slotRepository.findManyByIds.mockResolvedValue(Result.ok([]));

    const result = await service.createIncident(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not found/i);
  });

  it('falla si los slots no están disponibles', async () => {
    const { service } = buildMocks({ slotsUnavailable: true });

    const result = await service.createIncident(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not available/i);
  });

  it('falla si el slot está en el pasado (F1.3)', async () => {
    const pastSlot = makeSlotMock('slot-1', pastRange());
    pastSlot.isAvailable.mockReturnValue(false);
    pastSlot.isAvailableForUser.mockReturnValue(false);
    const { service } = buildMocks({ slots: [pastSlot] });

    const result = await service.createIncident(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not available/i);
  });

  it('reserva los slots de forma atómica antes de guardar (F1.4 — bookManyAtomic)', async () => {
    const { service, slotRepository, incidentRepository } = buildMocks();

    await service.createIncident(baseCommand);

    expect(slotRepository.bookManyAtomic).toHaveBeenCalledWith(
      [SlotId('slot-1')],
      undefined,
    );
    // bookManyAtomic debe haberse llamado ANTES de save
    const bookOrder = slotRepository.bookManyAtomic.mock.invocationCallOrder[0];
    const saveOrder = incidentRepository.save.mock.invocationCallOrder[0];
    expect(bookOrder).toBeLessThan(saveOrder);
  });

  it('falla con error claro cuando hay conflicto de slot concurrente (F1.5)', async () => {
    // bookManyAtomic retorna 0: otro request llegó primero
    const { service } = buildMocks({ bookManyAffected: 0 });

    const result = await service.createIncident(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(
      /horario.*no está disponible|no está disponible/i,
    );
  });

  it('no guarda el incident si bookManyAtomic detecta conflicto (F1.5)', async () => {
    const { service, incidentRepository } = buildMocks({ bookManyAffected: 0 });

    await service.createIncident(baseCommand);

    expect(incidentRepository.save).not.toHaveBeenCalled();
  });

  it('libera los slots reservados (compensación) si el save falla después del booking', async () => {
    const slot = makeSlotMock('slot-1');
    const { service, slotRepository } = buildMocks({
      saveFails: true,
      slots: [slot],
    });

    const result = await service.createIncident(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(slot.release).toHaveBeenCalledTimes(1);
    expect(slotRepository.updateMany).toHaveBeenCalledWith([slot]);
  });

  it('falla si el repositorio falla al guardar', async () => {
    const { service } = buildMocks({ saveFails: true });

    const result = await service.createIncident(baseCommand);

    expect(result.isFailure).toBe(true);
  });

  it('no publica eventos si el guardado falla', async () => {
    const { service, eventBus } = buildMocks({ saveFails: true });

    await service.createIncident(baseCommand);

    expect(eventBus.publishMany).not.toHaveBeenCalled();
  });

  it('pasa heldByUserId a bookManyAtomic cuando viene en el comando (F2.6)', async () => {
    const { service, slotRepository } = buildMocks();

    await service.createIncident({ ...baseCommand, heldByUserId: 'tech-99' });

    expect(slotRepository.bookManyAtomic).toHaveBeenCalledWith(
      [SlotId('slot-1')],
      'tech-99',
    );
  });

  it('no pasa userId a bookManyAtomic cuando no hay hold (path normal)', async () => {
    const { service, slotRepository } = buildMocks();

    await service.createIncident(baseCommand); // sin heldByUserId

    expect(slotRepository.bookManyAtomic).toHaveBeenCalledWith(
      [SlotId('slot-1')],
      undefined,
    );
  });

  it('usa el mismo Outbox que incidencias individuales (F1.4 — misma ruta a ServiceNow)', async () => {
    const { service, incidentRepository, eventBus } = buildMocks();

    await service.createIncident(baseCommand);

    // El outbox se alimenta via saveEvents + publishMany (igual que cualquier incidencia)
    expect(incidentRepository.saveEvents).toHaveBeenCalledTimes(1);
    expect(eventBus.publishMany).toHaveBeenCalledTimes(1);
    const [events] = eventBus.publishMany.mock.calls[0];
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('IncidentService.takeIncident()', () => {
  it('asigna técnico, guarda y publica evento', async () => {
    const { service, incidentRepository, eventBus, cache } = buildMocks();

    const result = await service.takeIncident({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().currentTechnicianId?.toString()).toBe('tech-1');
    expect(incidentRepository.save).toHaveBeenCalledTimes(1);
    expect(eventBus.publishMany).toHaveBeenCalledTimes(1);
    expect(cache.deletePattern).toHaveBeenCalledTimes(1);
  });

  it('falla si la incidencia no existe', async () => {
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(null));

    const result = await service.takeIncident({
      incidentId: IncidentId('inc-x'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not found/i);
  });

  it('falla si la incidencia está CANCELED', async () => {
    const canceled = makeIncident(IncidentStatus.CANCELED);
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(canceled));

    const result = await service.takeIncident({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
  });

  it('falla si el repositorio falla en findById', async () => {
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(
      Result.err(new Error('DB error')),
    );

    const result = await service.takeIncident({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('IncidentService.releaseIncident()', () => {
  it('libera técnico asignado sin cambiar estado', async () => {
    const incident = makeIncident(IncidentStatus.IN_PROGRESS);
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.releaseIncident({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
      reason: 'turno',
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().currentTechnicianId).toBeNull();
    expect(result.unwrap().status).toBe(IncidentStatus.IN_PROGRESS);
  });

  it('falla si la incidencia no existe', async () => {
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(null));

    const result = await service.releaseIncident({
      incidentId: IncidentId('x'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('IncidentService.changeStatus()', () => {
  it('transiciona IN_PROGRESS → PENDING_THIRD_PARTY', async () => {
    const incident = makeIncident(IncidentStatus.IN_PROGRESS);
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.changeStatus({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: IncidentStatus.PENDING_THIRD_PARTY,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(IncidentStatus.PENDING_THIRD_PARTY);
  });

  it('transiciona PENDING_PICKUP → CLOSED y registra closedAt', async () => {
    const incident = makeIncident(IncidentStatus.IN_PROGRESS);
    // Avanzar manualmente al estado previo requerido
    incident.changeStatus(
      IncidentStatus.PENDING_PICKUP,
      TechnicianId('tech-1'),
    );
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.changeStatus({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: IncidentStatus.CLOSED,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().closedAt).not.toBeNull();
  });

  it('falla con transición inválida (PENDING_PICKUP → IN_PROGRESS)', async () => {
    const incident = makeIncident(IncidentStatus.IN_PROGRESS);
    incident.changeStatus(
      IncidentStatus.PENDING_PICKUP,
      TechnicianId('tech-1'),
    );
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.changeStatus({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: IncidentStatus.IN_PROGRESS,
    });

    expect(result.isFailure).toBe(true);
  });

  it('falla si la incidencia no existe', async () => {
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(null));

    const result = await service.changeStatus({
      incidentId: IncidentId('x'),
      technicianId: TechnicianId('tech-1'),
      newStatus: IncidentStatus.PENDING_THIRD_PARTY,
    });

    expect(result.isFailure).toBe(true);
  });

  it('al cancelar libera a AVAILABLE los slots futuros y expira los pasados', async () => {
    const incident = makeIncident(IncidentStatus.CREATED);
    const futureSlot = makeSlotMock('slot-future');
    const pastSlot = makeSlotMock('slot-past', pastRange());
    const { service, incidentRepository, slotRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));
    slotRepository.findManyByIds.mockResolvedValue(
      Result.ok([futureSlot, pastSlot]),
    );

    const result = await service.changeStatus({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: IncidentStatus.CANCELED,
    });

    expect(result.isSuccess).toBe(true);
    expect(futureSlot.release).toHaveBeenCalledTimes(1);
    expect(futureSlot.expire).not.toHaveBeenCalled();
    expect(pastSlot.expire).toHaveBeenCalledTimes(1);
    expect(pastSlot.release).not.toHaveBeenCalled();
    expect(slotRepository.updateMany).toHaveBeenCalledWith([
      futureSlot,
      pastSlot,
    ]);
  });

  it('no expira slots en transiciones que no sean CANCELED', async () => {
    const incident = makeIncident(IncidentStatus.IN_PROGRESS);
    const { service, incidentRepository, slotRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    await service.changeStatus({
      incidentId: IncidentId('inc-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: IncidentStatus.PENDING_THIRD_PARTY,
    });

    expect(slotRepository.updateMany).not.toHaveBeenCalled();
  });
});

describe('IncidentService.validateIncident()', () => {
  it('transiciona de CLOSED a VALIDATED', async () => {
    const incident = makeIncident(IncidentStatus.CLOSED);
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.validateIncident({
      incidentId: IncidentId('inc-1'),
      customerId: CustomerId('cust-1'),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(IncidentStatus.VALIDATED);
  });

  it('falla si no está en CLOSED', async () => {
    const incident = makeIncident(IncidentStatus.IN_PROGRESS);
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.validateIncident({
      incidentId: IncidentId('inc-1'),
      customerId: CustomerId('cust-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('IncidentService.reopenIncident()', () => {
  it('transiciona de CLOSED a REOPENED e invalida caché', async () => {
    const incident = makeIncident(IncidentStatus.CLOSED);
    const { service, incidentRepository, cache } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.reopenIncident({
      incidentId: IncidentId('inc-1'),
      customerId: CustomerId('cust-1'),
      reason: 'sigue fallando',
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(IncidentStatus.REOPENED);
    expect(cache.deletePattern).toHaveBeenCalledTimes(1);
  });

  it('falla si no está en CLOSED', async () => {
    const incident = makeIncident(IncidentStatus.IN_PROGRESS);
    const { service, incidentRepository } = buildMocks();
    incidentRepository.findById.mockResolvedValue(Result.ok(incident));

    const result = await service.reopenIncident({
      incidentId: IncidentId('inc-1'),
      customerId: CustomerId('cust-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('IncidentService — queries', () => {
  it('getIncident() delega al repositorio', async () => {
    const { service, incidentRepository } = buildMocks();

    await service.getIncident(IncidentId('inc-1'));

    expect(incidentRepository.findById).toHaveBeenCalledWith(
      IncidentId('inc-1'),
    );
  });

  it('getAvailableIncidents() delega al repositorio', async () => {
    const { service, incidentRepository } = buildMocks();

    await service.getAvailableIncidents(CornerId('corner-1'));

    expect(incidentRepository.findAvailable).toHaveBeenCalledWith(
      CornerId('corner-1'),
    );
  });
});
