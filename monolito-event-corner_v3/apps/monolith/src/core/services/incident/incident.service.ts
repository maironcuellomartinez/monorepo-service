// core/services/incident/incident.service.ts
import { Injectable } from '@nestjs/common';
import { isFail, Result } from '@app/result';
import { LoggerService, TracingService } from '@app/observability';
import {
  IIncidentService,
  CreateIncidentCommand,
  DeliverIncidentCommand,
  TakeIncidentCommand,
  ReleaseIncidentCommand,
  RescheduleIncidentCommand,
  SetEstimatedCloseCommand,
  ChangeIncidentStatusCommand,
  ValidateIncidentCommand,
  ReopenIncidentCommand,
  CancelIncidentCommand,
  CloseFromExternalSyncCommand,
  BatchStatusChangeItem,
  BatchChangeResult,
} from '../../ports/incoming/incident/incident-service.port';
import { IIncidentRepository } from '../../ports/outgoing/repositories/incident-repository.port';
import { ISlotRepository } from '../../ports/outgoing/repositories/slot-repository.port';
import { ITechnicianRepository } from '../../ports/outgoing/repositories/technician-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { IUserRepository } from '../../ports/outgoing/repositories/user-repository.port';
import { ICompanyRepository } from '../../ports/outgoing/repositories/company-repository.port';
import { IIssueTypeRepository } from '../../ports/outgoing/repositories/issue-type-repository.port';
import { IEventBus } from '../../ports/outgoing/event-bus/event-bus.port';
import { ICache } from '../../ports/outgoing/cache/cache.port';
import { IDeviceService } from '../../ports/incoming/device/device-service.port';
import { Incident } from '../../domain/entities/incident.entity';
import {
  IncidentId,
  TechnicianId,
  CornerId,
  SlotId,
} from '../../domain/value-objects/ids';
import { DateRange } from '../../domain/value-objects/date-range.value';
import { IncidentOrigin } from '../../domain/enums/incident-origin.enum';
import { IncidentStatus } from '../../domain/enums/incident-status.enum';
import { IssueTypeNotAllowedForCompanyError } from '@app/shared/errors/domain-error';
import { DeviceHasActiveIncidentError } from '../../domain/errors/incident.errors';

const CTX = 'IncidentService';

@Injectable()
export class IncidentService implements IIncidentService {
  constructor(
    private readonly incidentRepository: IIncidentRepository,
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

  async createIncident(
    command: CreateIncidentCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.createIncident',
      {
        kind: 'server',
        attributes: {
          'incident.customerId': command.customerId,
          'incident.cornerId': command.cornerId,
          'incident.issueTypeId': command.issueTypeId,
        },
      },
      () => this._createIncident(command),
    );
  }

  private async _createIncident(
    command: CreateIncidentCommand,
  ): Promise<Result<Incident>> {
    this.logger.log(
      `createIncident start — customer=${command.customerId} corner=${command.cornerId} issueType=${command.issueTypeId} slots=${command.slotIds.length}`,
      CTX,
    );

    const incidentId = IncidentId(crypto.randomUUID());
    const cornerId = CornerId(command.cornerId);
    const slotIds = command.slotIds.map((id) => SlotId(id));

    // 1. Obtener y validar slots
    const slotsResult = await this.slotRepository.findManyByIds(slotIds);
    if (isFail(slotsResult)) return Result.err(slotsResult.unwrapError());

    const slots = slotsResult.unwrap();

    const missingIds = slotIds.filter((id) => !slots.some((s) => s.id === id));
    if (missingIds.length > 0) {
      this.logger.warn(
        `createIncident — slots not found: ${missingIds.join(', ')}`,
        CTX,
      );
      return Result.err(new Error(`Slots not found: ${missingIds.join(', ')}`));
    }

    // heldByUserId permite que slots HELD por el propio técnico (lote) pasen la validación
    const unavailable = slots.filter(
      (s) => !s.isAvailableForUser(command.heldByUserId),
    );
    if (unavailable.length > 0) {
      this.logger.warn(
        `createIncident — slots unavailable: ${unavailable.map((s) => s.id).join(', ')}`,
        CTX,
      );
      return Result.err(
        new Error(
          `Slots not available: ${unavailable.map((s) => s.id).join(', ')}`,
        ),
      );
    }

    // 2. Validar que el tipo de incidencia pertenece al árbol de la empresa del usuario
    const userResult = await this.userRepository.findById(command.customerId);
    if (userResult.isFailure) return Result.err(userResult.unwrapError());

    /**
     * @description Valida que el usuario pertenece a una empresa.
     * @param {CustomerId} customerId - ID del usuario.
     * @returns {Result<User>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si el usuario no existe o no tiene una empresa asignada.
     */
    const user = userResult.unwrap();
    if (!user)
      return Result.err(new Error(`User ${command.customerId} not found`));
    if (!user.companyId)
      return Result.err(
        new Error(`User ${command.customerId} has no company assigned`),
      );

    /**
     * @description Valida que el usuario pertenece a una empresa.
     * @param {CompanyId} companyId - ID de la empresa.
     * @returns {Result<Company>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si la empresa no existe o no tiene un árbol asignado.
     */
    const companyResult = await this.companyRepository.findById(user.companyId);
    if (companyResult.isFailure) return Result.err(companyResult.unwrapError());

    /**
     * @description Valida que el usuario pertenece a una empresa y que el tipo de incidencia pertenece al árbol de la empresa del usuario.
     * @param {CompanyId} companyId - ID de la empresa.
     * @returns {Result<Company>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si la empresa no existe.
     */
    const company = companyResult.unwrap();
    if (!company)
      return Result.err(new Error(`Company ${user.companyId} not found`));

    /**
     * @description Valida que el tipo de incidencia pertenece al árbol de la empresa del usuario.
     * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
     * @returns {Result<IssueType>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si el tipo de incidencia no existe.
     */
    const issueTypeResult = await this.issueTypeRepository.findById(
      command.issueTypeId,
    );
    if (issueTypeResult.isFailure)
      return Result.err(issueTypeResult.unwrapError());

    /**
     * @description Valida que el tipo de incidencia pertenece al árbol de la empresa del usuario.
     * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
     * @returns {Result<IssueType>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si el tipo de incidencia no existe.
     */
    const issueType = issueTypeResult.unwrap();
    if (!issueType)
      return Result.err(
        new Error(`Issue type ${command.issueTypeId} not found`),
      );

    /**
     * @description Valida que el tipo de incidencia pertenece al árbol de la empresa del usuario.
     * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
     * @returns {Result<IssueType>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si el tipo de incidencia no existe.
     */
    if (issueType.treeId.toString() !== company.treeId.toString()) {
      this.logger.warn(
        `createIncident — issueType ${command.issueTypeId} not allowed for company ${user.companyId}`,
        CTX,
      );
      return Result.err(
        new IssueTypeNotAllowedForCompanyError(
          command.issueTypeId,
          user.companyId.toString(),
        ),
      );
    }

    /**
     * @description Deriva scheduledRange desde los slots (punto de verdad único).
     * @param {SlotId[]} slotIds - IDs de los slots.
     * @returns {Result<DateRange>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si los slots no existen.
     */
    const sorted = [...slots].sort(
      (a, b) => a.timeRange.start.getTime() - b.timeRange.start.getTime(),
    );
    const scheduledRange = DateRange.reconstitute(
      sorted[0].timeRange.start,
      sorted[sorted.length - 1].timeRange.end,
    );

    /**
     * @description Crea la entidad Incident.
     * @param {IncidentId} incidentId - ID de la incidencia.
     * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
     * @param {CustomerId} customerId - ID del usuario.
     * @param {CornerId} cornerId - ID del rincón.
     * @param {SlotId[]} slotIds - IDs de los slots.
     * @param {DateRange} scheduledRange - Rango de fechas programado.
     * @param {IncidentOrigin} origin - Origen de la incidencia.
     * @param {Record<string, any>} metadata - Metadatos de la incidencia.
     * @returns {Result<Incident>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si la incidencia no se pudo crear.
     */
    // Resolver y vincular el dispositivo del usuario
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

    // Un dispositivo no puede tener dos incidencias abiertas a la vez:
    // rechazar si ya existe una en estado no terminal. Antes del booking
    // para no entrar al camino de compensación de slots.
    const activeForDeviceResult =
      await this.incidentRepository.findActiveByDeviceId(device.id.toString());
    if (activeForDeviceResult.isFailure)
      return Result.err(activeForDeviceResult.unwrapError());
    const activeForDevice = activeForDeviceResult.unwrap();
    if (activeForDevice.length > 0) {
      const existing = activeForDevice[0];
      const ref =
        existing.servicenowNumber?.value ??
        `${existing.id.toString().slice(0, 8)}...`;
      this.logger.warn(
        `createIncident — device ${command.device.serialNumber} ya tiene incidencia activa ${existing.id}`,
        CTX,
      );
      return Result.err(
        new DeviceHasActiveIncidentError(command.device.serialNumber, ref),
      );
    }

    // Booking atómico ANTES de guardar el incident.
    // Si hay holds del técnico (lote), los convierte directamente (HELD → BOOKED).
    // Si no, toma slots AVAILABLE. Falla si otro request ya los tomó.
    const bookResult = await this.slotRepository.bookManyAtomic(
      slotIds,
      command.heldByUserId,
    );
    if (bookResult.isFailure) return Result.err(bookResult.unwrapError());

    const booked = bookResult.unwrap();
    if (booked < slotIds.length) {
      this.logger.warn(
        `createIncident — slot conflict: expected to book ${slotIds.length}, only booked ${booked}. slotIds=${slotIds.join(', ')}`,
        CTX,
      );
      return Result.err(
        new Error(
          'El horario seleccionado ya no está disponible. Por favor elegí otro horario.',
        ),
      );
    }

    // Default de cierre estimado = inicio de la cita + closeMinutes del tipo
    // de incidencia. Es solo el punto de partida — el técnico lo puede
    // corregir libremente después vía setEstimatedClose().
    const estimatedCloseAt = new Date(
      scheduledRange.start.getTime() + issueType.closeMinutes.value * 60_000,
    );

    // Si quien crea la incidencia es un técnico, se usa como assigned_to en SN
    // (SN_DEFAULT_TECHNICIAN queda para employee/manager, que no tienen perfil de técnico).
    let creatorTechnicianEmail: string | null = null;
    if (command.creatorExternalId) {
      const creatorUserResult = await this.userRepository.findByExternalId(command.creatorExternalId);
      const creatorUser = creatorUserResult.isSuccess ? creatorUserResult.unwrap() : null;
      if (creatorUser) {
        const creatorTechResult = await this.technicianRepository.findByUserId(creatorUser.id.toString());
        const creatorTech = creatorTechResult.isSuccess ? creatorTechResult.unwrap() : null;
        if (creatorTech) creatorTechnicianEmail = creatorTech.email;
      }
    }

    const incidentResult = Incident.create(
      incidentId,
      command.issueTypeId,
      command.customerId,
      cornerId,
      slotIds,
      scheduledRange,
      command.origin as IncidentOrigin,
      command.metadata || {},
      estimatedCloseAt,
      creatorTechnicianEmail,
    );

    if (incidentResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return incidentResult;
    }
    const incident = incidentResult.unwrap();
    incident.attachDevice(device.id.toString());

    const events = incident.pullEvents();

    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) {
      this.logger.error(
        `createIncident — save failed: ${saveResult.unwrapError().message}`,
        saveResult.unwrapError().stack ?? '',
        CTX,
      );
      await this.releaseBookedSlots(slotIds);
      return Result.err(saveResult.unwrapError());
    }

    /**
     * @description Persiste el timeline y publica al Outbox.
     * @param {IncidentId} incidentId - ID de la incidencia.
     * @param {DomainEvent[]} events - Eventos de la incidencia.
     * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si el timeline no se pudo persistir o los eventos no se pudieron publicar.
     */
    const timelineResult = await this.incidentRepository.saveEvents(incident.id, events);
    if (timelineResult.isFailure) {
      this.logger.error(
        `createIncident — saveEvents failed id=${incident.id}: ${timelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    /**
     * @description Invalidar caché de disponibilidad.
     * @param {CornerId} cornerId - ID del rincón.
     * @param {DateRange} scheduledRange - Rango de fechas programado.
     * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
     * @returns {Error} Si la caché no se pudo invalidar.
     */
    const dateStr = scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(`availability:${cornerId}:${dateStr}:*`);

    this.logger.log(
      `createIncident success — id=${incident.id} origin=${incident.origin} slots=${slots.length} scheduled=${scheduledRange.start.toISOString()}`,
      CTX,
    );
    return Result.ok(incident);
  }

  /**
   * Compensación: revierte a AVAILABLE los slots que bookManyAtomic ya marcó
   * BOOKED cuando la creación de la incidencia falla después de la reserva.
   * bookManyAtomic es un UPDATE condicional independiente del save del
   * incident (no comparten transacción) — sin esta compensación los slots
   * quedarían BOOKED huérfanos: horario bloqueado sin incidencia asociada.
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

  async deliverIncident(
    command: DeliverIncidentCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.deliverIncident',
      {
        kind: 'server',
        attributes: {
          'incident.incidentId': command.incidentId,
          'incident.technicianId': command.technicianId,
        },
      },
      () => this._deliverIncident(command),
    );
  }

  private async _deliverIncident(
    command: DeliverIncidentCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());

    const incident = incidentResult.unwrap();
    if (!incident) {
      return Result.err(new Error(`Incident ${command.incidentId} not found`));
    }

    const deliverResult = incident.deliver(command.technicianId);
    if (deliverResult.isFailure) return Result.err(deliverResult.unwrapError());

    const deliverEvents = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const deliverTimelineResult = await this.incidentRepository.saveEvents(incident.id, deliverEvents);
    if (deliverTimelineResult.isFailure) {
      this.logger.error(
        `deliverIncident — saveEvents failed id=${incident.id}: ${deliverTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(deliverEvents);

    const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${dateStr}:*`,
    );

    return Result.ok(incident);
  }

  async takeIncident(command: TakeIncidentCommand): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.takeIncident',
      {
        kind: 'server',
        attributes: {
          'incident.incidentId': command.incidentId,
          'incident.technicianId': command.technicianId,
        },
      },
      () => this._takeIncident(command),
    );
  }

  private async _takeIncident(
    command: TakeIncidentCommand,
  ): Promise<Result<Incident>> {
    // 1. Obtener incidencia
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());

    const incident = incidentResult.unwrap();
    if (!incident) {
      return Result.err(new Error(`Incident ${command.incidentId} not found`));
    }

    const technicianId = command.technicianId;

    // Tomar una incidencia CLOSED implica recuperarla: se reabre (→ REOPENED),
    // se asigna el técnico y se reprograma a un horario nuevo (el anterior ya
    // pasó o quedó liberado). Requiere slotIds del llamador.
    // CANCELED es terminal — no se reabre, cae al take() normal de abajo,
    // que falla porque CANCELED no está en TAKEABLE_STATUSES.
    const needsReopen = incident.status === IncidentStatus.CLOSED;

    if (needsReopen) {
      return this._takeAndReopenIncident(incident, technicianId, command.slotIds);
    }

    // 2. Tomar incidencia (caso normal — sin cambio de horario)
    const takeResult = incident.take(technicianId);
    if (takeResult.isFailure) return Result.err(takeResult.unwrapError());

    // 3. Extraer eventos antes de guardar
    const takeEvents = incident.pullEvents();

    // 4. Guardar cambios
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    // 5. Persistir timeline y publicar al Outbox
    const takeTimelineResult = await this.incidentRepository.saveEvents(incident.id, takeEvents);
    if (takeTimelineResult.isFailure) {
      this.logger.error(
        `takeIncident — saveEvents failed id=${incident.id}: ${takeTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(takeEvents);

    // 6. Invalidar caché
    const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${dateStr}:*`,
    );

    return Result.ok(incident);
  }

  private async _takeAndReopenIncident(
    incident: Incident,
    technicianId: TechnicianId,
    slotIds?: SlotId[],
  ): Promise<Result<Incident>> {
    if (!slotIds || slotIds.length === 0) {
      return Result.err(
        new Error('Debés elegir un horario nuevo para tomar esta incidencia'),
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

    const previousSlotIds = incident.slotIds;
    const previousCornerId = incident.cornerId;
    const previousDateStr = incident.scheduledRange.start.toISOString().split('T')[0];

    const reopenResult = incident.reopen('Recuperada por técnico al tomarla');
    if (reopenResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(reopenResult.unwrapError());
    }

    const takeResult = incident.take(technicianId);
    if (takeResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(takeResult.unwrapError());
    }

    const rescheduleResult = incident.reschedule(technicianId, slotIds, newRange);
    if (rescheduleResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(rescheduleResult.unwrapError());
    }

    const events = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) {
      await this.releaseBookedSlots(slotIds);
      return Result.err(saveResult.unwrapError());
    }

    // Liberar el/los slot(s) viejo(s): futuro → AVAILABLE, pasado → EXPIRED.
    const oldSlotsResult = await this.slotRepository.findManyByIds(previousSlotIds);
    if (!oldSlotsResult.isFailure) {
      const oldSlots = oldSlotsResult.unwrap();
      const now = new Date();
      for (const s of oldSlots) {
        if (s.timeRange.start > now) {
          s.release();
        } else {
          s.expire();
        }
      }
      await this.slotRepository.updateMany(oldSlots);
    }

    const timelineResult = await this.incidentRepository.saveEvents(incident.id, events);
    if (timelineResult.isFailure) {
      this.logger.error(
        `takeIncident(reopen) — saveEvents failed id=${incident.id}: ${timelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    await this.cache.deletePattern(`availability:${previousCornerId}:${previousDateStr}:*`);
    const newDateStr = newRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(`availability:${incident.cornerId}:${newDateStr}:*`);

    this.logger.log(
      `takeIncident(reopen) — id=${incident.id} technician=${technicianId} ${previousDateStr}→${newDateStr}`,
      CTX,
    );

    return Result.ok(incident);
  }

  async releaseIncident(
    command: ReleaseIncidentCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.releaseIncident',
      {
        kind: 'server',
        attributes: {
          'incident.incidentId': command.incidentId,
          'incident.technicianId': command.technicianId,
        },
      },
      () => this._releaseIncident(command),
    );
  }

  private async _releaseIncident(
    command: ReleaseIncidentCommand,
  ): Promise<Result<Incident>> {
    // Similar a takeIncident
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());

    const incident = incidentResult.unwrap();
    if (!incident) {
      return Result.err(new Error(`Incident ${command.incidentId} not found`));
    }

    const technicianId = command.technicianId;
    const releaseResult = incident.release(technicianId, command.reason);
    if (releaseResult.isFailure) return Result.err(releaseResult.unwrapError());

    const releaseEvents = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const releaseTimelineResult = await this.incidentRepository.saveEvents(incident.id, releaseEvents);
    if (releaseTimelineResult.isFailure) {
      this.logger.error(
        `releaseIncident — saveEvents failed id=${incident.id}: ${releaseTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(releaseEvents);

    const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${dateStr}:*`,
    );

    return Result.ok(incident);
  }

  async rescheduleIncident(
    command: RescheduleIncidentCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.rescheduleIncident',
      {
        kind: 'server',
        attributes: {
          'incident.incidentId': command.incidentId,
          'incident.technicianId': command.technicianId,
        },
      },
      () => this._rescheduleIncident(command),
    );
  }

  private async _rescheduleIncident(
    command: RescheduleIncidentCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());
    const incident = incidentResult.unwrap();
    if (!incident) {
      return Result.err(new Error(`Incident ${command.incidentId} not found`));
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

    // Reserva atómica de los slots nuevos ANTES de tocar el agregado —
    // mismo patrón (y mismo mensaje de conflicto) que _createIncident.
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

    const previousSlotIds = incident.slotIds;
    const previousCornerId = incident.cornerId;
    const previousDateStr = incident.scheduledRange.start
      .toISOString()
      .split('T')[0];

    const rescheduleResult = incident.reschedule(
      command.technicianId,
      newSlotIds,
      newRange,
    );
    if (rescheduleResult.isFailure) {
      await this.releaseBookedSlots(newSlotIds);
      return Result.err(rescheduleResult.unwrapError());
    }

    const events = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) {
      await this.releaseBookedSlots(newSlotIds);
      return Result.err(saveResult.unwrapError());
    }

    // Liberar el/los slot(s) viejo(s): futuro → AVAILABLE, pasado → EXPIRED
    // (misma semántica que cancelIncident/changeStatus(CANCELED)).
    const oldSlotsResult = await this.slotRepository.findManyByIds(
      previousSlotIds,
    );
    if (!oldSlotsResult.isFailure) {
      const oldSlots = oldSlotsResult.unwrap();
      const now = new Date();
      for (const s of oldSlots) {
        if (s.timeRange.start > now) {
          s.release();
        } else {
          s.expire();
        }
      }
      await this.slotRepository.updateMany(oldSlots);
    }

    const rescheduleTimelineResult = await this.incidentRepository.saveEvents(incident.id, events);
    if (rescheduleTimelineResult.isFailure) {
      this.logger.error(
        `rescheduleIncident — saveEvents failed id=${incident.id}: ${rescheduleTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    await this.cache.deletePattern(
      `availability:${previousCornerId}:${previousDateStr}:*`,
    );
    const newDateStr = newRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${newDateStr}:*`,
    );

    this.logger.log(
      `rescheduleIncident — id=${incident.id} technician=${command.technicianId} ${previousDateStr}→${newDateStr}`,
      CTX,
    );

    return Result.ok(incident);
  }

  async setEstimatedClose(
    command: SetEstimatedCloseCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.setEstimatedClose',
      {
        kind: 'server',
        attributes: {
          'incident.incidentId': command.incidentId,
          'incident.technicianId': command.technicianId,
        },
      },
      () => this._setEstimatedClose(command),
    );
  }

  private async _setEstimatedClose(
    command: SetEstimatedCloseCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());
    const incident = incidentResult.unwrap();
    if (!incident) {
      return Result.err(new Error(`Incident ${command.incidentId} not found`));
    }

    const result = incident.setEstimatedClose(
      command.technicianId,
      command.estimatedCloseAt,
    );
    if (result.isFailure) return Result.err(result.unwrapError());

    const events = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const estimatedCloseTimelineResult = await this.incidentRepository.saveEvents(incident.id, events);
    if (estimatedCloseTimelineResult.isFailure) {
      this.logger.error(
        `setEstimatedClose — saveEvents failed id=${incident.id}: ${estimatedCloseTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);

    return Result.ok(incident);
  }

  async changeStatus(
    command: ChangeIncidentStatusCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.changeStatus',
      {
        kind: 'server',
        attributes: {
          'incident.incidentId': command.incidentId,
          'incident.newStatus': command.newStatus,
        },
      },
      () => this._changeStatus(command),
    );
  }

  private async _changeStatus(
    command: ChangeIncidentStatusCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());

    const incident = incidentResult.unwrap();
    if (!incident) {
      return Result.err(new Error(`Incident ${command.incidentId} not found`));
    }

    const prevStatus = incident.status;
    const technicianId = command.technicianId;
    const changeResult = incident.changeStatus(
      command.newStatus,
      technicianId,
      command.comment,
      command.closeCategory,
    );
    if (changeResult.isFailure) {
      this.logger.warn(
        `changeStatus — transition rejected id=${command.incidentId} ${prevStatus}→${command.newStatus}: ${changeResult.unwrapError().message}`,
        CTX,
      );
      return Result.err(changeResult.unwrapError());
    }

    const statusEvents = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    // Si se cancela: slots futuros vuelven a AVAILABLE (re-reservables),
    // los pasados quedan EXPIRED — misma semántica que cancelIncident().
    if (command.newStatus === IncidentStatus.CANCELED) {
      const slotsResult = await this.slotRepository.findManyByIds(
        incident.slotIds,
      );
      if (slotsResult.isFailure) return Result.err(slotsResult.unwrapError());
      const slots = slotsResult.unwrap();
      const now = new Date();
      for (const s of slots) {
        if (s.timeRange.start > now) {
          s.release();
        } else {
          s.expire();
        }
      }
      const slotsUpdateResult = await this.slotRepository.updateMany(slots);
      if (slotsUpdateResult.isFailure)
        return Result.err(slotsUpdateResult.unwrapError());
    }

    const statusTimelineResult = await this.incidentRepository.saveEvents(incident.id, statusEvents);
    if (statusTimelineResult.isFailure) {
      this.logger.error(
        `changeStatus — saveEvents failed id=${incident.id}: ${statusTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(statusEvents);

    const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${dateStr}:*`,
    );

    this.logger.log(
      `changeStatus — id=${incident.id} ${prevStatus}→${incident.status}`,
      CTX,
    );
    return Result.ok(incident);
  }

  async closeFromExternalSync(
    command: CloseFromExternalSyncCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.closeFromExternalSync',
      {
        kind: 'server',
        attributes: { 'incident.incidentId': command.incidentId },
      },
      () => this._closeFromExternalSync(command),
    );
  }

  private async _closeFromExternalSync(
    command: CloseFromExternalSyncCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());

    const incident = incidentResult.unwrap();
    if (!incident) {
      return Result.err(new Error(`Incident ${command.incidentId} not found`));
    }

    const prevStatus = incident.status;
    const closeResult = incident.closeFromExternalSync(command.comment);
    if (closeResult.isFailure) {
      this.logger.warn(
        `closeFromExternalSync — rejected id=${command.incidentId} status=${prevStatus}: ${closeResult.unwrapError().message}`,
        CTX,
      );
      return Result.err(closeResult.unwrapError());
    }

    const statusEvents = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const closeSyncTimelineResult = await this.incidentRepository.saveEvents(incident.id, statusEvents);
    if (closeSyncTimelineResult.isFailure) {
      this.logger.error(
        `closeFromExternalSync — saveEvents failed id=${incident.id}: ${closeSyncTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(statusEvents);

    const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${dateStr}:*`,
    );

    this.logger.log(
      `closeFromExternalSync — id=${incident.id} ${prevStatus}→CLOSED`,
      CTX,
    );
    return Result.ok(incident);
  }

  async validateIncident(
    command: ValidateIncidentCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.validateIncident',
      {
        kind: 'server',
        attributes: { 'incident.incidentId': command.incidentId },
      },
      () => this._validateIncident(command),
    );
  }

  private async _validateIncident(
    command: ValidateIncidentCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());
    const incident = incidentResult.unwrap();
    if (!incident)
      return Result.err(new Error(`Incident ${command.incidentId} not found`));

    const result = incident.validate();
    if (result.isFailure) return Result.err(result.unwrapError());

    const validateEvents = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const validateTimelineResult = await this.incidentRepository.saveEvents(incident.id, validateEvents);
    if (validateTimelineResult.isFailure) {
      this.logger.error(
        `validateIncident — saveEvents failed id=${incident.id}: ${validateTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(validateEvents);
    return Result.ok(incident);
  }

  async reopenIncident(
    command: ReopenIncidentCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.reopenIncident',
      {
        kind: 'server',
        attributes: { 'incident.incidentId': command.incidentId },
      },
      () => this._reopenIncident(command),
    );
  }

  private async _reopenIncident(
    command: ReopenIncidentCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());
    const incident = incidentResult.unwrap();
    if (!incident)
      return Result.err(new Error(`Incident ${command.incidentId} not found`));

    const result = incident.reopen(command.reason);
    if (result.isFailure) return Result.err(result.unwrapError());

    const reopenEvents = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    const reopenTimelineResult = await this.incidentRepository.saveEvents(incident.id, reopenEvents);
    if (reopenTimelineResult.isFailure) {
      this.logger.error(
        `reopenIncident — saveEvents failed id=${incident.id}: ${reopenTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(reopenEvents);
    const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${dateStr}:*`,
    );
    return Result.ok(incident);
  }

  async cancelIncident(
    command: CancelIncidentCommand,
  ): Promise<Result<Incident>> {
    return this.tracing.run(
      'monolith.cancelIncident',
      {
        kind: 'server',
        attributes: {
          'incident.incidentId': command.incidentId,
          'incident.customerId': command.customerId,
        },
      },
      () => this._cancelIncident(command),
    );
  }

  private async _cancelIncident(
    command: CancelIncidentCommand,
  ): Promise<Result<Incident>> {
    const incidentResult = await this.incidentRepository.findById(
      command.incidentId,
    );
    if (incidentResult.isFailure)
      return Result.err(incidentResult.unwrapError());
    const incident = incidentResult.unwrap();
    if (!incident)
      return Result.err(new Error(`Incident ${command.incidentId} not found`));

    // REOPENED = nuevo slot, el dispositivo aún no fue entregado (igual que
    // CREATED) — el cliente también puede cancelarla desde ahí.
    if (
      incident.status !== IncidentStatus.CREATED &&
      incident.status !== IncidentStatus.REOPENED
    ) {
      return Result.err(
        new Error(
          `Solo se pueden cancelar incidencias en estado CREATED o REOPENED. Estado actual: ${incident.status}`,
        ),
      );
    }

    // Use changeStatus — technicianId is stored in the event but not validated for CANCELED
    const result = incident.changeStatus(
      IncidentStatus.CANCELED,
      null as any,
      command.reason,
    );
    if (result.isFailure) return Result.err(result.unwrapError());

    const events = incident.pullEvents();
    const saveResult = await this.incidentRepository.save(incident);
    if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

    // Release future slots back to AVAILABLE; expire past ones
    const slotsResult = await this.slotRepository.findManyByIds(
      incident.slotIds,
    );
    if (!slotsResult.isFailure) {
      const slots = slotsResult.unwrap();
      const now = new Date();
      for (const s of slots) {
        if (s.timeRange.start > now) {
          s.release(); // Future slot → AVAILABLE (re-bookable)
        } else {
          s.expire(); // Past slot → EXPIRED
        }
      }
      await this.slotRepository.updateMany(slots);
    }

    const cancelTimelineResult = await this.incidentRepository.saveEvents(incident.id, events);
    if (cancelTimelineResult.isFailure) {
      this.logger.error(
        `cancelIncident — saveEvents failed id=${incident.id}: ${cancelTimelineResult.unwrapError().message}`,
        CTX,
      );
    }
    await this.eventBus.publishMany(events);
    const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
    await this.cache.deletePattern(
      `availability:${incident.cornerId}:${dateStr}:*`,
    );

    this.logger.log(
      `cancelIncident — id=${incident.id} by customer=${command.customerId}`,
      CTX,
    );
    return Result.ok(incident);
  }

  async getIncident(id: IncidentId): Promise<Result<Incident | null>> {
    return this.incidentRepository.findById(id);
  }

  async getAvailableIncidents(cornerId: CornerId): Promise<Result<Incident[]>> {
    return this.incidentRepository.findAvailable(cornerId);
  }

  async getTechnicianIncidents(
    technicianId: TechnicianId,
  ): Promise<Result<Incident[]>> {
    return this.incidentRepository.findByTechnician(technicianId);
  }

  async getIncidentsByDate(
    cornerId: CornerId,
    date: Date,
  ): Promise<Result<Incident[]>> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return this.incidentRepository.findByDateRange(cornerId, start, end);
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

    // Reject duplicate incidentIds within the same batch
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.incidentId)) {
        result.failed++;
        result.errors.push({
          incidentId: item.incidentId,
          reason: 'Duplicate incidentId in batch',
        });
        continue;
      }
      seen.add(item.incidentId);

      try {
        const incidentResult = await this.incidentRepository.findById(
          IncidentId(item.incidentId),
        );
        if (incidentResult.isFailure) {
          result.failed++;
          result.errors.push({
            incidentId: item.incidentId,
            reason: incidentResult.unwrapError().message,
          });
          continue;
        }

        const incident = incidentResult.unwrap();
        if (!incident) {
          result.failed++;
          result.errors.push({
            incidentId: item.incidentId,
            reason: 'Incident not found',
          });
          continue;
        }

        // Idempotency: already at the target status — skip silently
        if (incident.status === item.targetStatus) {
          result.skipped++;
          continue;
        }

        let changeResult: Result<void>;
        if (item.targetStatus === IncidentStatus.REOPENED) {
          changeResult = incident.reopen(item.reason);
        } else {
          changeResult = incident.changeStatus(
            item.targetStatus,
            TechnicianId(item.technicianId),
            item.comment,
            item.closeCategory,
          );
        }

        if (changeResult.isFailure) {
          result.failed++;
          result.errors.push({
            incidentId: item.incidentId,
            reason: changeResult.unwrapError().message,
          });
          continue;
        }

        const batchEvents = incident.pullEvents();
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) {
          result.failed++;
          result.errors.push({
            incidentId: item.incidentId,
            reason: saveResult.unwrapError().message,
          });
          continue;
        }

        const batchTimelineResult = await this.incidentRepository.saveEvents(incident.id, batchEvents);
        if (batchTimelineResult.isFailure) {
          this.logger.error(
            `batchChangeStatus — saveEvents failed id=${incident.id}: ${batchTimelineResult.unwrapError().message}`,
            CTX,
          );
        }
        await this.eventBus.publishMany(batchEvents);

        const dateStr = incident.scheduledRange.start
          .toISOString()
          .split('T')[0];
        await this.cache.deletePattern(
          `availability:${incident.cornerId}:${dateStr}:*`,
        );

        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          incidentId: item.incidentId,
          reason: error?.message ?? String(error),
        });
      }
    }

    return Result.ok(result);
  }
}
