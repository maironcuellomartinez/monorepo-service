// core/services/appointment/appointment.service.ts
import { Injectable } from '@nestjs/common';
import { isFail, Result } from '@app/result';
import { LoggerService, TracingService } from '@app/observability';
import {
  IAppointmentService,
  CreateAppointmentCommand,
  DeliverAppointmentCommand,
  TakeAppointmentCommand,
  ReleaseAppointmentCommand,
  RescheduleAppointmentCommand,
  SetEstimatedCloseCommand,
  ChangeAppointmentStatusCommand,
  ValidateAppointmentCommand,
  ReopenAppointmentCommand,
  CancelAppointmentCommand,
  BatchStatusChangeItem,
  BatchChangeResult,
} from '../../ports/incoming/appointment/appointment-service.port';
import { IAppointmentRepository } from '../../ports/outgoing/repositories/appointment-repository.port';
import { ISlotRepository } from '../../ports/outgoing/repositories/slot-repository.port';
import { ITechnicianRepository } from '../../ports/outgoing/repositories/technician-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { IUserRepository } from '../../ports/outgoing/repositories/user-repository.port';
import { ICompanyRepository } from '../../ports/outgoing/repositories/company-repository.port';
import { IIssueTypeRepository } from '../../ports/outgoing/repositories/issue-type-repository.port';
import { IEventBus } from '../../ports/outgoing/event-bus/event-bus.port';
import { ICache } from '../../ports/outgoing/cache/cache.port';
import { IDeviceService } from '../../ports/incoming/device/device-service.port';
import { Appointment } from '../../domain/entities/appointment.entity';
import { Technician } from '../../domain/entities/technician.entity';
import { Slot } from '../../domain/entities/slot.entity';
import {
  AppointmentId,
  CompanyId,
  CornerId,
  SlotId,
  TechnicianId,
} from '../../domain/value-objects/ids';
import { DateRange } from '../../domain/value-objects/date-range.value';
import { AppointmentOrigin } from '../../domain/enums/appointment-origin.enum';
import { AppointmentStatus, ACTIVE_STATUSES } from '../../domain/enums/appointment-status.enum';
import { appointmentKindFromIssueCategory } from '../../domain/enums/appointment-kind.enum';
import { IssueTypeNotAllowedForCompanyError } from '@app/shared/errors/domain-error';
import { DeviceHasActiveAppointmentError, AppointmentNotFoundError } from '../../domain/errors/appointment.errors';

const CTX = 'AppointmentService';

@Injectable()
export class AppointmentService implements IAppointmentService {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly slotRepository: ISlotRepository,
    private readonly technicianRepository: ITechnicianRepository,
    private readonly cornerRepository: ICornerRepository,
    private readonly userRepository: IUserRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly issueTypeRepository: IIssueTypeRepository,
    private readonly eventBus: IEventBus,
    private readonly cache: ICache,
    private readonly logger: LoggerService,
    private readonly tracing: TracingService,
    private readonly deviceService: IDeviceService,
  ) {}

  async createAppointment(
    command: CreateAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.createAppointment',
      {
        kind: 'server',
        attributes: {
          'appointment.customerId': command.customerId,
          'appointment.cornerId': command.cornerId,
          'appointment.issueTypeId': command.issueTypeId,
        },
      },
      () => this._createAppointment(command),
    );
  }

  private async _createAppointment(
    command: CreateAppointmentCommand,
  ): Promise<Result<Appointment>> {
    this.logger.log(
      `createAppointment start — customer=${command.customerId} corner=${command.cornerId} issueType=${command.issueTypeId} slots=${command.slotIds.length}`,
      CTX,
    );

    const appointmentId = AppointmentId(crypto.randomUUID());
    const cornerId = CornerId(command.cornerId);
    const slotIds = command.slotIds.map((id) => SlotId(id));

    // 1. Obtener y validar slots
    const slotsResult = await this.slotRepository.findManyByIds(slotIds);
    if (isFail(slotsResult)) return Result.err(slotsResult.unwrapError());

    const slots = slotsResult.unwrap();

    const missingIds = slotIds.filter((id) => !slots.some((s) => s.id === id));
    if (missingIds.length > 0) {
      this.logger.warn(
        `createAppointment — slots not found: ${missingIds.join(', ')}`,
        CTX,
      );
      return Result.err(new Error(`Slots not found: ${missingIds.join(', ')}`));
    }

    // Resolver si quien crea la cita es un técnico — vía creatorExternalId
    // (creación individual, JWT del usuario autenticado) o heldByUserId
    // (lote de técnico, sin creatorExternalId). Un técnico puede reutilizar
    // cualquier slot (disponible u ocupado) sin reclamarlo en exclusiva —
    // habilita walk-ins cuando los slots normales se agotan. Un empleado
    // (sin resolución a técnico) sigue el booking exclusivo de siempre.
    let creatorTech: Technician | null = null;
    if (command.creatorExternalId) {
      const creatorUserResult = await this.userRepository.findByExternalId(
        command.creatorExternalId,
      );
      const creatorUser = creatorUserResult.isSuccess
        ? creatorUserResult.unwrap()
        : null;
      if (creatorUser) {
        const creatorTechResult = await this.technicianRepository.findByUserId(
          creatorUser.id.toString(),
        );
        creatorTech = creatorTechResult.isSuccess
          ? creatorTechResult.unwrap()
          : null;
      }
    } else if (command.heldByUserId) {
      const creatorTechResult = await this.technicianRepository.findByUserId(
        command.heldByUserId,
      );
      creatorTech = creatorTechResult.isSuccess
        ? creatorTechResult.unwrap()
        : null;
    }
    const isTechnicianCreator = !!creatorTech;
    const creatorTechnicianEmail = creatorTech?.email ?? null;

    if (!isTechnicianCreator) {
      const unavailable = slots.filter(
        (s) => !s.isAvailableForUser(command.heldByUserId),
      );
      if (unavailable.length > 0) {
        this.logger.warn(
          `createAppointment — slots unavailable: ${unavailable.map((s) => s.id).join(', ')}`,
          CTX,
        );
        return Result.err(
          new Error(
            `Slots not available: ${unavailable.map((s) => s.id).join(', ')}`,
          ),
        );
      }
    }

    // 2. Resolver tipo de incidencia + kind
    const issueTypeResult = await this.issueTypeRepository.findById(
      command.issueTypeId,
    );
    if (issueTypeResult.isFailure)
      return Result.err(issueTypeResult.unwrapError());
    const issueType = issueTypeResult.unwrap();
    if (!issueType)
      return Result.err(
        new Error(`Issue type ${command.issueTypeId} not found`),
      );
    const kind = appointmentKindFromIssueCategory(issueType.category);

    // 3. Resolver usuario
    const userResult = await this.userRepository.findById(command.customerId);
    if (userResult.isFailure) return Result.err(userResult.unwrapError());
    const user = userResult.unwrap();
    if (!user)
      return Result.err(new Error(`User ${command.customerId} not found`));

    // 4. Resolver técnico creador (paridad Request: siempre exige que exista)
    if (command.createdByTechnicianId) {
      const techResult = await this.technicianRepository.findById(
        command.createdByTechnicianId,
      );
      if (techResult.isFailure) return Result.err(techResult.unwrapError());
      if (!techResult.unwrap()) {
        return Result.err(
          new Error(`Technician ${command.createdByTechnicianId} not found`),
        );
      }
    }

    // 5. Resolver empresa — explícita (técnico crea la cita, paridad Request)
    // o derivada del customer (paridad Incident).
    const companyId: CompanyId | null =
      command.companyId ?? (user.companyId as CompanyId | null);
    if (!companyId) {
      return Result.err(
        new Error(`User ${command.customerId} has no company assigned`),
      );
    }

    const companyResult = await this.companyRepository.findById(companyId);
    if (companyResult.isFailure) return Result.err(companyResult.unwrapError());
    const company = companyResult.unwrap();
    if (!company)
      return Result.err(new Error(`Company ${companyId} not found`));

    if (issueType.treeId.toString() !== company.treeId.toString()) {
      this.logger.warn(
        `createAppointment — issueType ${command.issueTypeId} not allowed for company ${companyId}`,
        CTX,
      );
      return Result.err(
        new IssueTypeNotAllowedForCompanyError(
          command.issueTypeId,
          companyId.toString(),
        ),
      );
    }

    // 6. Resolver y vincular el dispositivo del usuario
    const deviceResult = await this.deviceService.resolveAndLinkDevice(
      command.device.serialNumber,
      command.customerId,
    );
    if (deviceResult.isFailure) return Result.err(deviceResult.unwrapError());

    const device = deviceResult.unwrap();
    if (!device) {
      return Result.err(
        new Error(
          `El dispositivo ${command.device.serialNumber} no está registrado en el inventario`,
        ),
      );
    }

    // Un dispositivo no puede tener dos citas abiertas a la vez (aplica a
    // ambos kinds — consecuencia natural de unificar Incident+Request).
    const activeForDeviceResult =
      await this.appointmentRepository.findActiveByDeviceId(device.id.toString());
    if (activeForDeviceResult.isFailure)
      return Result.err(activeForDeviceResult.unwrapError());
    const activeForDevice = activeForDeviceResult.unwrap();
    if (activeForDevice.length > 0) {
      const existing = activeForDevice[0];
      this.logger.warn(
        `createAppointment — device ${command.device.serialNumber} ya tiene cita activa ${existing.id}`,
        CTX,
      );
      return Result.err(
        new DeviceHasActiveAppointmentError(
          command.device.serialNumber,
          `${existing.id.toString().slice(0, 8)}...`,
        ),
      );
    }

    // Booking atómico ANTES de guardar la cita — se saltea para técnicos
    // (isTechnicianCreator): no reclaman el slot en exclusiva, así que
    // corner_slots.status no se toca y puede seguir reutilizándose.
    if (!isTechnicianCreator) {
      const bookResult = await this.slotRepository.bookManyAtomic(
        slotIds,
        command.heldByUserId,
      );
      if (bookResult.isFailure) return Result.err(bookResult.unwrapError());

      const booked = bookResult.unwrap();
      if (booked < slotIds.length) {
        this.logger.warn(
          `createAppointment — slot conflict: expected to book ${slotIds.length}, only booked ${booked}. slotIds=${slotIds.join(', ')}`,
          CTX,
        );
        return Result.err(
          new Error(
            'El horario seleccionado ya no está disponible. Por favor elegí otro horario.',
          ),
        );
      }
    }

    const sorted = [...slots].sort(
      (a, b) => a.timeRange.start.getTime() - b.timeRange.start.getTime(),
    );
    const scheduledRange = DateRange.reconstitute(
      sorted[0].timeRange.start,
      sorted[sorted.length - 1].timeRange.end,
    );

    // Default de cierre estimado = inicio de la cita + closeMinutes del tipo.
    const estimatedCloseAt = new Date(
      scheduledRange.start.getTime() + issueType.closeMinutes.value * 60_000,
    );

    const metadata = command.notes
      ? { ...(command.metadata || {}), notes: command.notes }
      : command.metadata || {};

    const appointmentResult = Appointment.create(
      appointmentId,
      command.issueTypeId,
      kind,
      command.customerId,
      companyId,
      cornerId,
      slotIds,
      scheduledRange,
      command.origin as AppointmentOrigin,
      command.createdByTechnicianId ?? null,
      metadata,
      estimatedCloseAt,
      creatorTechnicianEmail,
    );

    if (appointmentResult.isFailure) {
      if (!isTechnicianCreator) await this.releaseBookedSlots(slotIds);
      return appointmentResult;
    }
    const appointment = appointmentResult.unwrap();
    appointment.attachDevice(device.id.toString());

    const events = appointment.pullEvents();

    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) {
      this.logger.error(
        `createAppointment — save failed: ${saveResult.unwrapError().message}`,
        saveResult.unwrapError().stack ?? '',
        CTX,
      );
      if (!isTechnicianCreator) await this.releaseBookedSlots(slotIds);
      return Result.err(saveResult.unwrapError());
    }

    const timelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      events,
    );
    if (timelineResult.isFailure) {
      this.logger.error(
        `createAppointment — saveEvents failed id=${appointment.id}: ${timelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    const dateStr = scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(`availability:${cornerId}:${dateStr}:*`);

    this.logger.log(
      `createAppointment success — id=${appointment.id} kind=${kind} origin=${appointment.origin} slots=${slots.length} scheduled=${scheduledRange.start.toISOString()}`,
      CTX,
    );
    return Result.ok(appointment);
  }

  /**
   * Compensación: revierte a AVAILABLE los slots que bookManyAtomic ya marcó
   * BOOKED cuando la creación de la cita falla después de la reserva.
   */
  private async releaseBookedSlots(slotIds: SlotId[]): Promise<void> {
    const slotsResult = await this.slotRepository.findManyByIds(slotIds);
    if (slotsResult.isFailure) {
      this.logger.error(
        `releaseBookedSlots — no se pudieron cargar los slots a liberar (${slotIds.join(', ')}): ${slotsResult.unwrapError().message}`,
        CTX,
      );
      return;
    }
    const slots = slotsResult.unwrap();
    for (const s of slots) s.release();
    const updateResult = await this.slotRepository.updateMany(slots);
    if (updateResult.isFailure) {
      this.logger.error(
        `releaseBookedSlots — no se pudieron liberar los slots ${slotIds.join(', ')}: ${updateResult.unwrapError().message}`,
        CTX,
      );
    }
  }

  /**
   * Libera (AVAILABLE) o expira (EXPIRED, si ya pasó) los slots dados al
   * cerrar/cancelar/reprogramar una cita — salvo que otra cita activa
   * (excluyendo excludeAppointmentId) todavía los use, en cuyo caso se dejan
   * intactos. Cubre el caso de varios técnicos compartiendo un mismo slot:
   * no se libera hasta que la última cita que lo usa se cierra/cancela.
   */
  private async releaseOrExpireSlots(
    slots: Slot[],
    excludeAppointmentId: AppointmentId,
  ): Promise<void> {
    if (slots.length === 0) return;

    const stillActiveResult =
      await this.appointmentRepository.findActiveAppointmentSlotIds(
        slots.map((s) => s.id),
        excludeAppointmentId,
      );
    if (stillActiveResult.isFailure) {
      this.logger.error(
        `releaseOrExpireSlots — no se pudo verificar uso activo de slots: ${stillActiveResult.unwrapError().message}`,
        CTX,
      );
    }
    const stillActive = stillActiveResult.isSuccess
      ? stillActiveResult.unwrap()
      : new Set<string>();

    const now = new Date();
    const toUpdate: Slot[] = [];
    for (const s of slots) {
      if (stillActive.has(s.id.toString())) continue;
      if (s.timeRange.start > now) {
        s.release();
      } else {
        s.expire();
      }
      toUpdate.push(s);
    }
    if (toUpdate.length === 0) return;

    const updateResult = await this.slotRepository.updateMany(toUpdate);
    if (updateResult.isFailure) {
      this.logger.error(
        `releaseOrExpireSlots — no se pudieron actualizar los slots: ${updateResult.unwrapError().message}`,
        CTX,
      );
    }
  }

  async deliverAppointment(
    command: DeliverAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.deliverAppointment',
      {
        kind: 'server',
        attributes: {
          'appointment.appointmentId': command.appointmentId,
          'appointment.technicianId': command.technicianId,
        },
      },
      () => this._deliverAppointment(command),
    );
  }

  private async _deliverAppointment(
    command: DeliverAppointmentCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());

    const appointment = appointmentResult.unwrap();
    if (!appointment) {
      return Result.err(new AppointmentNotFoundError(command.appointmentId));
    }

    const deliverResult = appointment.deliver(command.technicianId);
    if (deliverResult.isFailure) return Result.err(deliverResult.unwrapError());

    const deliverEvents = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const deliverTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      deliverEvents,
    );
    if (deliverTimelineResult.isFailure) {
      this.logger.error(
        `deliverAppointment — saveEvents failed id=${appointment.id}: ${deliverTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(deliverEvents);

    const dateStr = appointment.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${appointment.cornerId}:${dateStr}:*`,
    );

    return Result.ok(appointment);
  }

  async takeAppointment(
    command: TakeAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.takeAppointment',
      {
        kind: 'server',
        attributes: {
          'appointment.appointmentId': command.appointmentId,
          'appointment.technicianId': command.technicianId,
        },
      },
      () => this._takeAppointment(command),
    );
  }

  private async _takeAppointment(
    command: TakeAppointmentCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());

    const appointment = appointmentResult.unwrap();
    if (!appointment) {
      return Result.err(new AppointmentNotFoundError(command.appointmentId));
    }

    const technicianId = command.technicianId;

    // Tomar una cita CLOSED implica recuperarla: se reabre (→ REOPENED), se
    // asigna el técnico y se reprograma a un horario nuevo.
    const needsReopen = appointment.status === AppointmentStatus.CLOSED;

    if (needsReopen) {
      return this._takeAndReopenAppointment(appointment, technicianId, command.slotIds);
    }

    const takeResult = appointment.take(technicianId);
    if (takeResult.isFailure) return Result.err(takeResult.unwrapError());

    const takeEvents = appointment.pullEvents();

    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const takeTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      takeEvents,
    );
    if (takeTimelineResult.isFailure) {
      this.logger.error(
        `takeAppointment — saveEvents failed id=${appointment.id}: ${takeTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(takeEvents);

    const dateStr = appointment.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${appointment.cornerId}:${dateStr}:*`,
    );

    return Result.ok(appointment);
  }

  private async _takeAndReopenAppointment(
    appointment: Appointment,
    technicianId: TechnicianId,
    slotIds?: SlotId[],
  ): Promise<Result<Appointment>> {
    if (!slotIds || slotIds.length === 0) {
      return Result.err(
        new Error('Debés elegir un horario nuevo para tomar esta cita'),
      );
    }

    const newSlotsResult = await this.slotRepository.findManyByIds(slotIds);
    if (newSlotsResult.isFailure) return Result.err(newSlotsResult.unwrapError());
    const newSlots = newSlotsResult.unwrap();
    const missingIds = slotIds.filter((id) => !newSlots.some((s) => s.id === id));
    if (missingIds.length > 0) {
      return Result.err(new Error(`Slots not found: ${missingIds.join(', ')}`));
    }

    const bookResult = await this.slotRepository.bookManyAtomic(slotIds);
    if (bookResult.isFailure) return Result.err(bookResult.unwrapError());
    const booked = bookResult.unwrap();
    if (booked < slotIds.length) {
      return Result.err(
        new Error('El horario seleccionado ya no está disponible. Por favor elegí otro horario.'),
      );
    }

    const sorted = [...newSlots].sort(
      (a, b) => a.timeRange.start.getTime() - b.timeRange.start.getTime(),
    );
    const newRange = DateRange.reconstitute(
      sorted[0].timeRange.start,
      sorted[sorted.length - 1].timeRange.end,
    );

    const previousSlotIds = appointment.slotIds;
    const previousCornerId = appointment.cornerId;
    const previousDateStr = appointment.scheduledRange.start.toISOString().split('T')[0];

    const reopenResult = appointment.reopen('Recuperada por técnico al tomarla');
    if (reopenResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(reopenResult.unwrapError());
    }

    const takeResult = appointment.take(technicianId);
    if (takeResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(takeResult.unwrapError());
    }

    const rescheduleResult = appointment.reschedule(technicianId, slotIds, newRange);
    if (rescheduleResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(rescheduleResult.unwrapError());
    }

    const events = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(saveResult.unwrapError());
    }

    const oldSlotsResult = await this.slotRepository.findManyByIds(previousSlotIds);
    if (!oldSlotsResult.isFailure) {
      await this.releaseOrExpireSlots(oldSlotsResult.unwrap(), appointment.id);
    }

    const timelineResult = await this.appointmentRepository.saveEvents(appointment.id, events);
    if (timelineResult.isFailure) {
      this.logger.error(
        `takeAppointment(reopen) — saveEvents failed id=${appointment.id}: ${timelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    await this.cache.deletePattern(`availability:${previousCornerId}:${previousDateStr}:*`);
    const newDateStr = newRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(`availability:${appointment.cornerId}:${newDateStr}:*`);

    this.logger.log(
      `takeAppointment(reopen) — id=${appointment.id} technician=${technicianId} ${previousDateStr}→${newDateStr}`,
      CTX,
    );

    return Result.ok(appointment);
  }

  async releaseAppointment(
    command: ReleaseAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.releaseAppointment',
      {
        kind: 'server',
        attributes: {
          'appointment.appointmentId': command.appointmentId,
          'appointment.technicianId': command.technicianId,
        },
      },
      () => this._releaseAppointment(command),
    );
  }

  private async _releaseAppointment(
    command: ReleaseAppointmentCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());

    const appointment = appointmentResult.unwrap();
    if (!appointment) {
      return Result.err(new AppointmentNotFoundError(command.appointmentId));
    }

    const releaseResult = appointment.release(command.technicianId, command.reason);
    if (releaseResult.isFailure) return Result.err(releaseResult.unwrapError());

    const releaseEvents = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const releaseTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      releaseEvents,
    );
    if (releaseTimelineResult.isFailure) {
      this.logger.error(
        `releaseAppointment — saveEvents failed id=${appointment.id}: ${releaseTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(releaseEvents);

    const dateStr = appointment.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${appointment.cornerId}:${dateStr}:*`,
    );

    return Result.ok(appointment);
  }

  async rescheduleAppointment(
    command: RescheduleAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.rescheduleAppointment',
      {
        kind: 'server',
        attributes: {
          'appointment.appointmentId': command.appointmentId,
          'appointment.technicianId': command.technicianId,
        },
      },
      () => this._rescheduleAppointment(command),
    );
  }

  private async _rescheduleAppointment(
    command: RescheduleAppointmentCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());
    const appointment = appointmentResult.unwrap();
    if (!appointment) {
      return Result.err(new AppointmentNotFoundError(command.appointmentId));
    }

    const newSlotIds = command.slotIds;
    if (newSlotIds.length === 0) {
      return Result.err(new Error('Debe indicar al menos un slot nuevo'));
    }

    const newSlotsResult = await this.slotRepository.findManyByIds(newSlotIds);
    if (newSlotsResult.isFailure)
      return Result.err(newSlotsResult.unwrapError());
    const newSlots = newSlotsResult.unwrap();
    const missingIds = newSlotIds.filter(
      (id) => !newSlots.some((s) => s.id === id),
    );
    if (missingIds.length > 0) {
      return Result.err(new Error(`Slots not found: ${missingIds.join(', ')}`));
    }

    const bookResult = await this.slotRepository.bookManyAtomic(newSlotIds);
    if (bookResult.isFailure) return Result.err(bookResult.unwrapError());
    const booked = bookResult.unwrap();
    if (booked < newSlotIds.length) {
      return Result.err(
        new Error(
          'El horario seleccionado ya no está disponible. Por favor elegí otro horario.',
        ),
      );
    }

    const sorted = [...newSlots].sort(
      (a, b) => a.timeRange.start.getTime() - b.timeRange.start.getTime(),
    );
    const newRange = DateRange.reconstitute(
      sorted[0].timeRange.start,
      sorted[sorted.length - 1].timeRange.end,
    );

    const previousSlotIds = appointment.slotIds;
    const previousCornerId = appointment.cornerId;
    const previousDateStr = appointment.scheduledRange.start
      .toISOString()
      .split('T')[0];

    const rescheduleResult = appointment.reschedule(
      command.technicianId,
      newSlotIds,
      newRange,
    );
    if (rescheduleResult.isFailure) {
      await this.releaseBookedSlots(newSlotIds);
      return Result.err(rescheduleResult.unwrapError());
    }

    const events = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) {
      await this.releaseBookedSlots(newSlotIds);
      return Result.err(saveResult.unwrapError());
    }

    const oldSlotsResult = await this.slotRepository.findManyByIds(
      previousSlotIds,
    );
    if (!oldSlotsResult.isFailure) {
      await this.releaseOrExpireSlots(oldSlotsResult.unwrap(), appointment.id);
    }

    const rescheduleTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      events,
    );
    if (rescheduleTimelineResult.isFailure) {
      this.logger.error(
        `rescheduleAppointment — saveEvents failed id=${appointment.id}: ${rescheduleTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    await this.cache.deletePattern(
      `availability:${previousCornerId}:${previousDateStr}:*`,
    );
    const newDateStr = newRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${appointment.cornerId}:${newDateStr}:*`,
    );

    this.logger.log(
      `rescheduleAppointment — id=${appointment.id} technician=${command.technicianId} ${previousDateStr}→${newDateStr}`,
      CTX,
    );

    return Result.ok(appointment);
  }

  async setEstimatedClose(
    command: SetEstimatedCloseCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.setEstimatedClose',
      {
        kind: 'server',
        attributes: {
          'appointment.appointmentId': command.appointmentId,
          'appointment.technicianId': command.technicianId,
        },
      },
      () => this._setEstimatedClose(command),
    );
  }

  private async _setEstimatedClose(
    command: SetEstimatedCloseCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());
    const appointment = appointmentResult.unwrap();
    if (!appointment) {
      return Result.err(new AppointmentNotFoundError(command.appointmentId));
    }

    const result = appointment.setEstimatedClose(
      command.technicianId,
      command.estimatedCloseAt,
    );
    if (result.isFailure) return Result.err(result.unwrapError());

    const events = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const estimatedCloseTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      events,
    );
    if (estimatedCloseTimelineResult.isFailure) {
      this.logger.error(
        `setEstimatedClose — saveEvents failed id=${appointment.id}: ${estimatedCloseTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    return Result.ok(appointment);
  }

  async changeStatus(
    command: ChangeAppointmentStatusCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.changeStatus',
      {
        kind: 'server',
        attributes: {
          'appointment.appointmentId': command.appointmentId,
          'appointment.newStatus': command.newStatus,
        },
      },
      () => this._changeStatus(command),
    );
  }

  private async _changeStatus(
    command: ChangeAppointmentStatusCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());

    const appointment = appointmentResult.unwrap();
    if (!appointment) {
      return Result.err(new AppointmentNotFoundError(command.appointmentId));
    }

    const prevStatus = appointment.status;
    const technicianId = command.technicianId;
    const changeResult = appointment.changeStatus(
      command.newStatus,
      technicianId,
      command.comment,
      command.closeCategory,
    );
    if (changeResult.isFailure) {
      this.logger.warn(
        `changeStatus — transition rejected id=${command.appointmentId} ${prevStatus}→${command.newStatus}: ${changeResult.unwrapError().message}`,
        CTX,
      );
      return Result.err(changeResult.unwrapError());
    }

    const statusEvents = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    if (command.newStatus === AppointmentStatus.CANCELED) {
      const slotsResult = await this.slotRepository.findManyByIds(
        appointment.slotIds,
      );
      if (slotsResult.isFailure) return Result.err(slotsResult.unwrapError());
      await this.releaseOrExpireSlots(slotsResult.unwrap(), appointment.id);
    }

    const statusTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      statusEvents,
    );
    if (statusTimelineResult.isFailure) {
      this.logger.error(
        `changeStatus — saveEvents failed id=${appointment.id}: ${statusTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(statusEvents);

    const dateStr = appointment.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${appointment.cornerId}:${dateStr}:*`,
    );

    this.logger.log(
      `changeStatus — id=${appointment.id} ${prevStatus}→${appointment.status}`,
      CTX,
    );
    return Result.ok(appointment);
  }


  async validateAppointment(
    command: ValidateAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.validateAppointment',
      {
        kind: 'server',
        attributes: { 'appointment.appointmentId': command.appointmentId },
      },
      () => this._validateAppointment(command),
    );
  }

  private async _validateAppointment(
    command: ValidateAppointmentCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());
    const appointment = appointmentResult.unwrap();
    if (!appointment)
      return Result.err(new AppointmentNotFoundError(command.appointmentId));

    const result = appointment.validate();
    if (result.isFailure) return Result.err(result.unwrapError());

    const validateEvents = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const validateTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      validateEvents,
    );
    if (validateTimelineResult.isFailure) {
      this.logger.error(
        `validateAppointment — saveEvents failed id=${appointment.id}: ${validateTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(validateEvents);
    return Result.ok(appointment);
  }

  async reopenAppointment(
    command: ReopenAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.reopenAppointment',
      {
        kind: 'server',
        attributes: { 'appointment.appointmentId': command.appointmentId },
      },
      () => this._reopenAppointment(command),
    );
  }

  private async _reopenAppointment(
    command: ReopenAppointmentCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());
    const appointment = appointmentResult.unwrap();
    if (!appointment)
      return Result.err(new AppointmentNotFoundError(command.appointmentId));

    const result = appointment.reopen(command.reason);
    if (result.isFailure) return Result.err(result.unwrapError());

    const reopenEvents = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const reopenTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      reopenEvents,
    );
    if (reopenTimelineResult.isFailure) {
      this.logger.error(
        `reopenAppointment — saveEvents failed id=${appointment.id}: ${reopenTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(reopenEvents);
    const dateStr = appointment.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${appointment.cornerId}:${dateStr}:*`,
    );
    return Result.ok(appointment);
  }

  async cancelAppointment(
    command: CancelAppointmentCommand,
  ): Promise<Result<Appointment>> {
    return this.tracing.run(
      'monolith.cancelAppointment',
      {
        kind: 'server',
        attributes: {
          'appointment.appointmentId': command.appointmentId,
          'appointment.customerId': command.customerId,
        },
      },
      () => this._cancelAppointment(command),
    );
  }

  private async _cancelAppointment(
    command: CancelAppointmentCommand,
  ): Promise<Result<Appointment>> {
    const appointmentResult = await this.appointmentRepository.findById(
      command.appointmentId,
    );
    if (appointmentResult.isFailure)
      return Result.err(appointmentResult.unwrapError());
    const appointment = appointmentResult.unwrap();
    if (!appointment)
      return Result.err(new AppointmentNotFoundError(command.appointmentId));

    if (!ACTIVE_STATUSES.includes(appointment.status)) {
      return Result.err(
        new Error(
          `No se puede cancelar una cita en estado terminal. Estado actual: ${appointment.status}`,
        ),
      );
    }

    const result = appointment.changeStatus(
      AppointmentStatus.CANCELED,
      null as any,
      command.reason,
    );
    if (result.isFailure) return Result.err(result.unwrapError());

    const events = appointment.pullEvents();
    const saveResult = await this.appointmentRepository.save(appointment);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const slotsResult = await this.slotRepository.findManyByIds(
      appointment.slotIds,
    );
    if (!slotsResult.isFailure) {
      await this.releaseOrExpireSlots(slotsResult.unwrap(), appointment.id);
    }

    const cancelTimelineResult = await this.appointmentRepository.saveEvents(
      appointment.id,
      events,
    );
    if (cancelTimelineResult.isFailure) {
      this.logger.error(
        `cancelAppointment — saveEvents failed id=${appointment.id}: ${cancelTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);
    const dateStr = appointment.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${appointment.cornerId}:${dateStr}:*`,
    );

    this.logger.log(
      `cancelAppointment — id=${appointment.id} by customer=${command.customerId}`,
      CTX,
    );
    return Result.ok(appointment);
  }

  async getAppointment(id: AppointmentId): Promise<Result<Appointment | null>> {
    return this.appointmentRepository.findById(id);
  }

  async getAvailableAppointments(cornerId: CornerId): Promise<Result<Appointment[]>> {
    return this.appointmentRepository.findAvailable(cornerId);
  }

  async getTechnicianAppointments(
    technicianId: TechnicianId,
  ): Promise<Result<Appointment[]>> {
    return this.appointmentRepository.findByTechnician(technicianId);
  }

  async getCustomerAppointments(customerId: string): Promise<Result<Appointment[]>> {
    return this.appointmentRepository.findByCustomer(customerId as any);
  }

  async batchChangeStatus(
    items: BatchStatusChangeItem[],
  ): Promise<Result<BatchChangeResult>> {
    const result: BatchChangeResult = {
      processed: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.appointmentId)) {
        result.failed++;
        result.errors.push({
          appointmentId: item.appointmentId,
          reason: 'Duplicate appointmentId in batch',
        });
        continue;
      }
      seen.add(item.appointmentId);

      try {
        const appointmentResult = await this.appointmentRepository.findById(
          AppointmentId(item.appointmentId),
        );
        if (appointmentResult.isFailure) {
          result.failed++;
          result.errors.push({
            appointmentId: item.appointmentId,
            reason: appointmentResult.unwrapError().message,
          });
          continue;
        }

        const appointment = appointmentResult.unwrap();
        if (!appointment) {
          result.failed++;
          result.errors.push({
            appointmentId: item.appointmentId,
            reason: 'Appointment not found',
          });
          continue;
        }

        if (appointment.status === item.targetStatus) {
          result.skipped++;
          continue;
        }

        let changeResult: Result<void>;
        if (item.targetStatus === AppointmentStatus.REOPENED) {
          changeResult = appointment.reopen(item.reason);
        } else {
          changeResult = appointment.changeStatus(
            item.targetStatus,
            TechnicianId(item.technicianId),
            item.comment,
            item.closeCategory,
          );
        }

        if (changeResult.isFailure) {
          result.failed++;
          result.errors.push({
            appointmentId: item.appointmentId,
            reason: changeResult.unwrapError().message,
          });
          continue;
        }

        const batchEvents = appointment.pullEvents();
        const saveResult = await this.appointmentRepository.save(appointment);
        if (saveResult.isFailure) {
          result.failed++;
          result.errors.push({
            appointmentId: item.appointmentId,
            reason: saveResult.unwrapError().message,
          });
          continue;
        }

        const batchTimelineResult = await this.appointmentRepository.saveEvents(
          appointment.id,
          batchEvents,
        );
        if (batchTimelineResult.isFailure) {
          this.logger.error(
            `batchChangeStatus — saveEvents failed id=${appointment.id}: ${batchTimelineResult.unwrapError().message}`,
            CTX,
          );
        }
        await this.eventBus.publishMany(batchEvents);

        const dateStr = appointment.scheduledRange.start
          .toISOString()
          .split('T')[0];
        await this.cache.deletePattern(
          `availability:${appointment.cornerId}:${dateStr}:*`,
        );

        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          appointmentId: item.appointmentId,
          reason: error?.message ?? String(error),
        });
      }
    }

    return Result.ok(result);
  }
}
