// core/services/appointment/appointment.service.spec.ts
import { AppointmentService } from './appointment.service';
import { Appointment } from '../../domain/entities/appointment.entity';
import { AppointmentStatus } from '../../domain/enums/appointment-status.enum';
import { AppointmentOrigin } from '../../domain/enums/appointment-origin.enum';
import { AppointmentKind } from '../../domain/enums/appointment-kind.enum';
import { DateRange } from '../../domain/value-objects/date-range.value';
import { Result } from '@app/result';
import {
  AppointmentId,
  IssueTypeId,
  CustomerId,
  CompanyId,
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

function makeAppointment(status?: AppointmentStatus): Appointment {
  const appointment = Appointment.create(
    AppointmentId('apt-1'),
    IssueTypeId('issue-1'),
    AppointmentKind.ISSUE,
    CustomerId('cust-1'),
    CompanyId('company-1'),
    CornerId('corner-1'),
    [SlotId('slot-1')],
    futureRange(),
    AppointmentOrigin.CUSTOMER_APP,
  ).unwrap();

  if (!status || status === AppointmentStatus.CREATED) return appointment;

  const tech = TechnicianId('tech-1');

  // Helpers para navegar la máquina de estados real:
  // CREATED → DELIVERED → IN_PROGRESS → PENDING_PICKUP → CLOSED
  const toDelivered = () => appointment.deliver(tech);
  const toInProgress = () => {
    toDelivered();
    appointment.changeStatus(AppointmentStatus.IN_PROGRESS, tech);
  };
  const toClosed = () => {
    toInProgress();
    appointment.changeStatus(AppointmentStatus.PENDING_PICKUP, tech);
    appointment.changeStatus(AppointmentStatus.CLOSED, tech);
  };

  switch (status) {
    case AppointmentStatus.DELIVERED:
      toDelivered();
      break;
    case AppointmentStatus.IN_PROGRESS:
      toInProgress();
      break;
    case AppointmentStatus.PENDING_THIRD_PARTY:
      toInProgress();
      appointment.changeStatus(AppointmentStatus.PENDING_THIRD_PARTY, tech);
      break;
    case AppointmentStatus.CLOSED:
      toClosed();
      break;
    case AppointmentStatus.VALIDATED:
      toClosed();
      appointment.validate();
      break;
    case AppointmentStatus.REOPENED:
      toClosed();
      appointment.reopen();
      break;
    case AppointmentStatus.CANCELED:
      appointment.changeStatus(AppointmentStatus.CANCELED, tech);
      break;
  }

  return appointment;
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
  appointment?: Appointment | null;
  slots?: ReturnType<typeof makeSlotMock>[];
  saveFails?: boolean;
  slotsUnavailable?: boolean;
  bookManyAffected?: number;
}) {
  const appointment =
    opts?.appointment !== undefined ? opts.appointment : makeAppointment();
  const slots = opts?.slots ?? [makeSlotMock('slot-1')];
  if (opts?.slotsUnavailable)
    slots.forEach((s) => {
      s.isAvailable.mockReturnValue(false);
      s.isAvailableForUser.mockReturnValue(false);
    });

  const affected = opts?.bookManyAffected ?? slots.length;

  const appointmentRepository = {
    findById: jest.fn().mockResolvedValue(Result.ok(appointment)),
    findActiveByDeviceId: jest.fn().mockResolvedValue(Result.ok([])),
    save: jest
      .fn()
      .mockResolvedValue(
        opts?.saveFails
          ? Result.err(new Error('DB error'))
          : Result.ok(undefined),
      ),
    saveEvents: jest.fn().mockResolvedValue(Result.ok(undefined)),
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
    findByExternalId: jest.fn().mockResolvedValue(Result.ok(null)),
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
        category: 'ISSUE',
        closeMinutes: { value: 60 },
      }),
    ),
  };

  const technicianRepository = {
    findById: jest.fn().mockResolvedValue(Result.ok({ id: TechnicianId('tech-1') })),
    findByUserId: jest.fn().mockResolvedValue(Result.ok(null)),
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

  const service = new AppointmentService(
    appointmentRepository as any,
    slotRepository as any,
    technicianRepository as any,
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
    appointmentRepository,
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

describe('AppointmentService.createAppointment()', () => {
  const baseCommand = {
    issueTypeId: IssueTypeId('issue-1'),
    customerId: CustomerId('cust-1'),
    cornerId: CornerId('corner-1'),
    slotIds: [SlotId('slot-1')],
    origin: 'CUSTOMER_APP',
    device: { serialNumber: 'SN-001' },
  };

  it('crea una cita, guarda y publica eventos', async () => {
    const { service, appointmentRepository, eventBus, cache } = buildMocks();

    const result = await service.createAppointment(baseCommand);

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(AppointmentStatus.CREATED);
    expect(result.unwrap().kind).toBe(AppointmentKind.ISSUE);
    expect(appointmentRepository.save).toHaveBeenCalledTimes(1);
    expect(eventBus.publishMany).toHaveBeenCalledTimes(1);
    expect(cache.deletePattern).toHaveBeenCalledTimes(1);
  });

  it('invalida el caché con la clave correcta de disponibilidad', async () => {
    const slot = makeSlotMock('slot-1');
    const { service, cache } = buildMocks({ slots: [slot] });
    const dateStr = slot.timeRange.start.toISOString().split('T')[0];

    await service.createAppointment(baseCommand);

    expect(cache.deletePattern).toHaveBeenCalledWith(
      `availability:corner-1:${dateStr}:*`,
    );
  });

  it('falla si un slot no existe en el repositorio', async () => {
    const { service, slotRepository } = buildMocks();
    slotRepository.findManyByIds.mockResolvedValue(Result.ok([]));

    const result = await service.createAppointment(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not found/i);
  });

  it('falla si los slots no están disponibles', async () => {
    const { service } = buildMocks({ slotsUnavailable: true });

    const result = await service.createAppointment(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not available/i);
  });

  it('falla si el slot está en el pasado', async () => {
    const pastSlot = makeSlotMock('slot-1', pastRange());
    pastSlot.isAvailable.mockReturnValue(false);
    pastSlot.isAvailableForUser.mockReturnValue(false);
    const { service } = buildMocks({ slots: [pastSlot] });

    const result = await service.createAppointment(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not available/i);
  });

  it('reserva los slots de forma atómica antes de guardar', async () => {
    const { service, slotRepository, appointmentRepository } = buildMocks();

    await service.createAppointment(baseCommand);

    expect(slotRepository.bookManyAtomic).toHaveBeenCalledWith(
      [SlotId('slot-1')],
      undefined,
    );
    // bookManyAtomic debe haberse llamado ANTES de save
    const bookOrder = slotRepository.bookManyAtomic.mock.invocationCallOrder[0];
    const saveOrder = appointmentRepository.save.mock.invocationCallOrder[0];
    expect(bookOrder).toBeLessThan(saveOrder);
  });

  it('falla con error claro cuando hay conflicto de slot concurrente', async () => {
    // bookManyAtomic retorna 0: otro request llegó primero
    const { service } = buildMocks({ bookManyAffected: 0 });

    const result = await service.createAppointment(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(
      /horario.*no está disponible|no está disponible/i,
    );
  });

  it('no guarda la cita si bookManyAtomic detecta conflicto', async () => {
    const { service, appointmentRepository } = buildMocks({ bookManyAffected: 0 });

    await service.createAppointment(baseCommand);

    expect(appointmentRepository.save).not.toHaveBeenCalled();
  });

  it('libera los slots reservados (compensación) si el save falla después del booking', async () => {
    const slot = makeSlotMock('slot-1');
    const { service, slotRepository } = buildMocks({
      saveFails: true,
      slots: [slot],
    });

    const result = await service.createAppointment(baseCommand);

    expect(result.isFailure).toBe(true);
    expect(slot.release).toHaveBeenCalledTimes(1);
    expect(slotRepository.updateMany).toHaveBeenCalledWith([slot]);
  });

  it('falla si el repositorio falla al guardar', async () => {
    const { service } = buildMocks({ saveFails: true });

    const result = await service.createAppointment(baseCommand);

    expect(result.isFailure).toBe(true);
  });

  it('no publica eventos si el guardado falla', async () => {
    const { service, eventBus } = buildMocks({ saveFails: true });

    await service.createAppointment(baseCommand);

    expect(eventBus.publishMany).not.toHaveBeenCalled();
  });

  it('pasa heldByUserId a bookManyAtomic cuando viene en el comando', async () => {
    const { service, slotRepository } = buildMocks();

    await service.createAppointment({ ...baseCommand, heldByUserId: 'tech-99' });

    expect(slotRepository.bookManyAtomic).toHaveBeenCalledWith(
      [SlotId('slot-1')],
      'tech-99',
    );
  });

  it('no pasa userId a bookManyAtomic cuando no hay hold (path normal)', async () => {
    const { service, slotRepository } = buildMocks();

    await service.createAppointment(baseCommand); // sin heldByUserId

    expect(slotRepository.bookManyAtomic).toHaveBeenCalledWith(
      [SlotId('slot-1')],
      undefined,
    );
  });

  it('usa el mismo Outbox que citas individuales (misma ruta a ServiceNow)', async () => {
    const { service, appointmentRepository, eventBus } = buildMocks();

    await service.createAppointment(baseCommand);

    // El outbox se alimenta via saveEvents + publishMany (igual que cualquier cita)
    expect(appointmentRepository.saveEvents).toHaveBeenCalledTimes(1);
    expect(eventBus.publishMany).toHaveBeenCalledTimes(1);
    const [events] = eventBus.publishMany.mock.calls[0];
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('AppointmentService.takeAppointment()', () => {
  it('asigna técnico, guarda y publica evento', async () => {
    const { service, appointmentRepository, eventBus, cache } = buildMocks();

    const result = await service.takeAppointment({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().currentTechnicianId?.toString()).toBe('tech-1');
    expect(appointmentRepository.save).toHaveBeenCalledTimes(1);
    expect(eventBus.publishMany).toHaveBeenCalledTimes(1);
    expect(cache.deletePattern).toHaveBeenCalledTimes(1);
  });

  it('falla si la cita no existe', async () => {
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(null));

    const result = await service.takeAppointment({
      appointmentId: AppointmentId('apt-x'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
    expect(result.unwrapError().message).toMatch(/not found/i);
  });

  it('falla si la cita está CANCELED', async () => {
    const canceled = makeAppointment(AppointmentStatus.CANCELED);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(canceled));

    const result = await service.takeAppointment({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
  });

  it('falla si el repositorio falla en findById', async () => {
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(
      Result.err(new Error('DB error')),
    );

    const result = await service.takeAppointment({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('AppointmentService.releaseAppointment()', () => {
  it('libera técnico asignado sin cambiar estado', async () => {
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.releaseAppointment({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      reason: 'turno',
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().currentTechnicianId).toBeNull();
    expect(result.unwrap().status).toBe(AppointmentStatus.IN_PROGRESS);
  });

  it('falla si la cita no existe', async () => {
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(null));

    const result = await service.releaseAppointment({
      appointmentId: AppointmentId('x'),
      technicianId: TechnicianId('tech-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('AppointmentService.changeStatus()', () => {
  it('transiciona IN_PROGRESS → PENDING_THIRD_PARTY', async () => {
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.changeStatus({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.PENDING_THIRD_PARTY,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(AppointmentStatus.PENDING_THIRD_PARTY);
  });

  it('transiciona PENDING_PICKUP → CLOSED y registra closedAt', async () => {
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    // Avanzar manualmente al estado previo requerido
    appointment.changeStatus(
      AppointmentStatus.PENDING_PICKUP,
      TechnicianId('tech-1'),
    );
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.changeStatus({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.CLOSED,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().closedAt).not.toBeNull();
  });

  it('permite PENDING_PICKUP → IN_PROGRESS (el cliente no se presenta, el técnico sigue trabajando)', async () => {
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    appointment.changeStatus(
      AppointmentStatus.PENDING_PICKUP,
      TechnicianId('tech-1'),
    );
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.changeStatus({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.IN_PROGRESS,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(AppointmentStatus.IN_PROGRESS);
  });

  it('permite cerrar directo desde IN_PROGRESS (sin pasar por PENDING_PICKUP)', async () => {
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.changeStatus({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.CLOSED,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().closedAt).not.toBeNull();
  });

  it('falla con transición inválida (DELIVERED → PENDING_USER, debe pasar por IN_PROGRESS)', async () => {
    const appointment = makeAppointment(AppointmentStatus.DELIVERED);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.changeStatus({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.PENDING_USER,
    });

    expect(result.isFailure).toBe(true);
  });

  it('falla si la cita no existe', async () => {
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(null));

    const result = await service.changeStatus({
      appointmentId: AppointmentId('x'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.PENDING_THIRD_PARTY,
    });

    expect(result.isFailure).toBe(true);
  });

  it('al cancelar libera a AVAILABLE los slots futuros y expira los pasados', async () => {
    const appointment = makeAppointment(AppointmentStatus.CREATED);
    const futureSlot = makeSlotMock('slot-future');
    const pastSlot = makeSlotMock('slot-past', pastRange());
    const { service, appointmentRepository, slotRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));
    slotRepository.findManyByIds.mockResolvedValue(
      Result.ok([futureSlot, pastSlot]),
    );

    const result = await service.changeStatus({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.CANCELED,
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
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    const { service, appointmentRepository, slotRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    await service.changeStatus({
      appointmentId: AppointmentId('apt-1'),
      technicianId: TechnicianId('tech-1'),
      newStatus: AppointmentStatus.PENDING_THIRD_PARTY,
    });

    expect(slotRepository.updateMany).not.toHaveBeenCalled();
  });
});

describe('AppointmentService.validateAppointment()', () => {
  it('transiciona de CLOSED a VALIDATED', async () => {
    const appointment = makeAppointment(AppointmentStatus.CLOSED);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.validateAppointment({
      appointmentId: AppointmentId('apt-1'),
      customerId: CustomerId('cust-1'),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(AppointmentStatus.VALIDATED);
  });

  it('falla si no está en CLOSED', async () => {
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.validateAppointment({
      appointmentId: AppointmentId('apt-1'),
      customerId: CustomerId('cust-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('AppointmentService.reopenAppointment()', () => {
  it('transiciona de CLOSED a REOPENED e invalida caché', async () => {
    const appointment = makeAppointment(AppointmentStatus.CLOSED);
    const { service, appointmentRepository, cache } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.reopenAppointment({
      appointmentId: AppointmentId('apt-1'),
      customerId: CustomerId('cust-1'),
      reason: 'sigue fallando',
    });

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().status).toBe(AppointmentStatus.REOPENED);
    expect(cache.deletePattern).toHaveBeenCalledTimes(1);
  });

  it('falla si no está en CLOSED', async () => {
    const appointment = makeAppointment(AppointmentStatus.IN_PROGRESS);
    const { service, appointmentRepository } = buildMocks();
    appointmentRepository.findById.mockResolvedValue(Result.ok(appointment));

    const result = await service.reopenAppointment({
      appointmentId: AppointmentId('apt-1'),
      customerId: CustomerId('cust-1'),
    });

    expect(result.isFailure).toBe(true);
  });
});

describe('AppointmentService — queries', () => {
  it('getAppointment() delega al repositorio', async () => {
    const { service, appointmentRepository } = buildMocks();

    await service.getAppointment(AppointmentId('apt-1'));

    expect(appointmentRepository.findById).toHaveBeenCalledWith(
      AppointmentId('apt-1'),
    );
  });

  it('getAvailableAppointments() delega al repositorio', async () => {
    const { service, appointmentRepository } = buildMocks();

    await service.getAvailableAppointments(CornerId('corner-1'));

    expect(appointmentRepository.findAvailable).toHaveBeenCalledWith(
      CornerId('corner-1'),
    );
  });
});
