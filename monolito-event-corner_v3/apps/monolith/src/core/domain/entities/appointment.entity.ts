// core/domain/entities/appointment.entity.ts
import { DateRange } from '../value-objects/date-range.value';
import { AppointmentStatus, TAKEABLE_STATUSES, TERMINAL_STATUSES } from '../enums/appointment-status.enum';
import { AppointmentOrigin } from '../enums/appointment-origin.enum';
import { AppointmentKind } from '../enums/appointment-kind.enum';

import {
  AppointmentNotAvailableError,
  InvalidAppointmentStateError,
  AppointmentTechnicianNotAuthorizedError,
} from '../errors/appointment.errors';
import { APPOINTMENT_CONSTANTS } from '../constants/appointment.constants';
import { Result } from '@app/result';
import {
  AppointmentId,
  CornerId,
  CustomerId,
  CompanyId,
  IssueTypeId,
  LockerId,
  SlotId,
  TechnicianId,
} from '../value-objects/ids';
import { DomainEvent } from '@app/shared/domain-event';

export class Appointment {
  private _events: DomainEvent[] = [];

  private constructor(
    private readonly _id: AppointmentId,
    private _issueTypeId: IssueTypeId,
    private _kind: AppointmentKind,
    private _customerId: CustomerId,
    private _companyId: CompanyId,
    private _cornerId: CornerId,
    private _slotIds: SlotId[],
    private _scheduledRange: DateRange,
    private _durationMinutes: number,
    private _status: AppointmentStatus,
    private _origin: AppointmentOrigin,
    private _priority: number,
    private _currentTechnicianId: TechnicianId | null,
    /** Técnico que creó la cita (paridad con el Request de hoy, que siempre exige un técnico creador). Solo informativo/auditoría — no participa en disponibilidad. */
    private _createdByTechnicianId: TechnicianId | null,
    private _deviceId: string | null,
    private _lockerId: LockerId | null,
    private _metadata: Record<string, any>,
    private _closedAt: Date | null,
    private _comment: string | null,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    /**
     * Correlativo incremental (contador `'appointment'` en `issue_sequences`)
     * usado como referencia externa estable — análogo al id numérico del
     * legacy (ej. '1526'). Lo asigna la DB al insertar, por eso es null hasta
     * que se recarga el agregado desde persistencia tras el primer save().
     */
    private readonly _issueId: number | null = null,
    /**
     * Fecha estimada de cierre — editable libremente por el técnico asignado
     * (paridad legacy: independiente del slot, no valida disponibilidad).
     * Default al crear: scheduledRange.start + IssueType.closeMinutes.
     */
    private _estimatedCloseAt: Date | null = null,
  ) {}

  // Enriched device info (populated from DB relation, not persisted)
  private _deviceInfo: {
    serialNumber: string;
    model: string | null;
    brand: string | null;
  } | null = null;
  setDeviceInfo(
    info: {
      serialNumber: string;
      model: string | null;
      brand: string | null;
    } | null,
  ) {
    this._deviceInfo = info;
  }

  // Enriched customer info (populated from DB relation, not persisted)
  private _customerInfo: {
    id: string;
    email: string | null;
    name: string | null;
  } | null = null;
  setCustomerInfo(
    info: { id: string; email: string | null; name: string | null } | null,
  ) {
    this._customerInfo = info;
  }

  // Enriched technician info (populated from DB relation, not persisted)
  private _technicianInfo: { id: string; name: string } | null = null;
  setTechnicianInfo(info: { id: string; name: string } | null) {
    this._technicianInfo = info;
  }

  // Enriched corner info (populated from DB relation, not persisted)
  private _cornerInfo: { id: string; name: string } | null = null;
  setCornerInfo(info: { id: string; name: string } | null) {
    this._cornerInfo = info;
  }

  // Enriched issue type info (populated from DB relation, not persisted)
  private _issueTypeInfo: { id: string; name: string } | null = null;
  setIssueTypeInfo(info: { id: string; name: string } | null) {
    this._issueTypeInfo = info;
  }

  // Getters
  get id(): AppointmentId {
    return this._id;
  }
  /** Correlativo incremental estable — null hasta el primer reload post-persistencia. */
  get issueId(): number | null {
    return this._issueId;
  }
  get estimatedCloseAt(): Date | null {
    return this._estimatedCloseAt;
  }
  get status(): AppointmentStatus {
    return this._status;
  }
  get kind(): AppointmentKind {
    return this._kind;
  }
  get scheduledRange(): DateRange {
    return this._scheduledRange;
  }
  get currentTechnicianId(): TechnicianId | null {
    return this._currentTechnicianId;
  }
  get createdByTechnicianId(): TechnicianId | null {
    return this._createdByTechnicianId;
  }
  get cornerId(): CornerId {
    return this._cornerId;
  }
  get customerId(): CustomerId {
    return this._customerId;
  }
  get companyId(): CompanyId {
    return this._companyId;
  }
  get slotIds(): SlotId[] {
    return [...this._slotIds];
  }
  get durationMinutes(): number {
    return this._durationMinutes;
  }
  get issueTypeId(): IssueTypeId {
    return this._issueTypeId;
  }
  get lockerId(): LockerId | null {
    return this._lockerId;
  }
  get deviceId(): string | null {
    return this._deviceId;
  }

  attachDevice(deviceId: string): void {
    this._deviceId = deviceId;
    this._updatedAt = new Date();
  }
  get priority(): number {
    return this._priority;
  }
  get origin(): AppointmentOrigin {
    return this._origin;
  }
  get metadata(): Record<string, any> {
    return this._metadata;
  }
  get comment(): string | null {
    return this._comment;
  }
  get closedAt(): Date | null {
    return this._closedAt;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  // Métodos de negocio con Result

  /** Indica si la cita está disponible para ser tomada por un técnico. */
  isAvailableForTaking(): boolean {
    return TAKEABLE_STATUSES.includes(this._status);
  }

  /**
   * Registra la entrega del dispositivo por parte del cliente.
   * Transición: CREATED → DELIVERED.
   */
  deliver(technicianId: TechnicianId): Result<void> {
    if (this._status !== AppointmentStatus.CREATED) {
      return Result.err(
        new InvalidAppointmentStateError(
          this._status,
          'deliver (must be CREATED)',
        ),
      );
    }

    this._status = AppointmentStatus.DELIVERED;
    this._currentTechnicianId = technicianId;
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_DELIVERED', this._id, 'Appointment', {
        technicianId,
        previousStatus: AppointmentStatus.CREATED,
      }),
    );

    return Result.ok(undefined);
  }

  /**
   * Cualquier técnico puede tomar cualquier cita no terminal.
   * Solo cambia el técnico asignado — el estado NO cambia.
   */
  take(technicianId: TechnicianId): Result<void> {
    if (!this.isAvailableForTaking()) {
      return Result.err(new AppointmentNotAvailableError(this._id));
    }

    const previousTechnicianId = this._currentTechnicianId;
    this._currentTechnicianId = technicianId;
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_TAKEN', this._id, 'Appointment', {
        technicianId,
        previousTechnicianId,
        currentStatus: this._status,
      }),
    );

    return Result.ok(undefined);
  }

  /**
   * Libera la cita: quita el técnico asignado sin asignar otro.
   * Cualquier técnico puede liberar cualquier cita activa.
   */
  release(technicianId: TechnicianId, reason?: string): Result<void> {
    if (!TAKEABLE_STATUSES.includes(this._status)) {
      return Result.err(new InvalidAppointmentStateError(this._status, 'release'));
    }

    const previousTechnicianId = this._currentTechnicianId;
    this._currentTechnicianId = null;
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_RELEASED', this._id, 'Appointment', {
        technicianId,
        reason,
        previousTechnicianId,
      }),
    );

    return Result.ok(undefined);
  }

  /** Solo las citas en estado `CLOSED` pueden validarse → `VALIDATED`. */
  validate(): Result<void> {
    if (this._status !== AppointmentStatus.CLOSED) {
      return Result.err(
        new InvalidAppointmentStateError(
          this._status,
          'validate (must be CLOSED)',
        ),
      );
    }

    this._status = AppointmentStatus.VALIDATED;
    this._updatedAt = new Date();

    this.addEvent(new DomainEvent('APPOINTMENT_VALIDATED', this._id, 'Appointment'));

    return Result.ok(undefined);
  }

  /** Solo las citas en estado `CLOSED` pueden reabrirse → `REOPENED`. */
  reopen(reason?: string): Result<void> {
    // Solo CLOSED puede reabrirse. CANCELED es terminal: la cancelación es
    // una decisión del cliente, no un cierre recuperable.
    if (this._status !== AppointmentStatus.CLOSED) {
      return Result.err(
        new InvalidAppointmentStateError(this._status, 'reopen (must be CLOSED)'),
      );
    }

    this._status = AppointmentStatus.REOPENED;
    this._currentTechnicianId = null;
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_REOPENED', this._id, 'Appointment', {
        reason,
      }),
    );

    return Result.ok(undefined);
  }

  /**
   * Reprograma la cita a un nuevo horario (nuevos slots ya reservados por el
   * llamador — este método solo actualiza el agregado, no toca disponibilidad).
   * Paridad con legacy: permitido desde cualquier estado no terminal, solo
   * requiere ser el técnico actualmente asignado.
   */
  reschedule(
    technicianId: TechnicianId,
    newSlotIds: SlotId[],
    newRange: DateRange,
  ): Result<void> {
    if (
      !this._currentTechnicianId ||
      this._currentTechnicianId !== technicianId
    ) {
      return Result.err(
        new AppointmentTechnicianNotAuthorizedError(technicianId, 'reschedule this appointment'),
      );
    }
    if (TERMINAL_STATUSES.includes(this._status)) {
      return Result.err(
        new InvalidAppointmentStateError(this._status, 'reschedule (ya es terminal)'),
      );
    }

    const previousSlotIds = [...this._slotIds];
    this._slotIds = newSlotIds;
    this._scheduledRange = newRange;
    this._durationMinutes = newRange.getDurationMinutes();
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_RESCHEDULED', this._id, 'Appointment', {
        technicianId,
        previousSlotIds,
        newSlotIds,
        scheduledStart: newRange.start,
        scheduledEnd: newRange.end,
      }),
    );

    return Result.ok(undefined);
  }

  /**
   * Corrige la fecha estimada de cierre. Es un dato informativo del técnico
   * (no gatilla ninguna lógica de disponibilidad) — paridad con legacy:
   * editable libremente desde cualquier estado no terminal.
   */
  setEstimatedClose(technicianId: TechnicianId, date: Date): Result<void> {
    if (
      !this._currentTechnicianId ||
      this._currentTechnicianId !== technicianId
    ) {
      return Result.err(
        new AppointmentTechnicianNotAuthorizedError(
          technicianId,
          'set estimated close for this appointment',
        ),
      );
    }
    if (TERMINAL_STATUSES.includes(this._status)) {
      return Result.err(
        new InvalidAppointmentStateError(
          this._status,
          'setEstimatedClose (ya es terminal)',
        ),
      );
    }
    if (isNaN(date.getTime())) {
      return Result.err(new Error('Invalid estimated close date'));
    }

    const previousEstimatedCloseAt = this._estimatedCloseAt;
    this._estimatedCloseAt = date;
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_ESTIMATED_CLOSE_CHANGED', this._id, 'Appointment', {
        technicianId,
        previousEstimatedCloseAt,
        newEstimatedCloseAt: date,
      }),
    );

    return Result.ok(undefined);
  }

  /**
   * Cambia el estado de la cita aplicando la máquina de estados definida en
   * `APPOINTMENT_CONSTANTS`. Solo el técnico asignado puede cambiar el estado.
   */
  changeStatus(
    newStatus: AppointmentStatus,
    technicianId: TechnicianId,
    comment?: string,
    closeCategory?: string,
  ): Result<void> {
    const validTransitions =
      (
        APPOINTMENT_CONSTANTS.VALID_STATUS_TRANSITIONS as Record<
          string,
          readonly string[]
        >
      )[this._status] ?? [];

    if (!validTransitions.includes(newStatus)) {
      return Result.err(
        new InvalidAppointmentStateError(
          this._status,
          `transition to ${newStatus}`,
        ),
      );
    }

    const oldStatus = this._status;
    this._status = newStatus;
    this._updatedAt = new Date();

    if (newStatus === AppointmentStatus.CLOSED) {
      this._closedAt = new Date();
      this._currentTechnicianId = null;
    }

    if (newStatus === AppointmentStatus.CANCELED) {
      this._currentTechnicianId = null;
    }

    this.addEvent(
      new DomainEvent('APPOINTMENT_STATUS_CHANGED', this._id, 'Appointment', {
        technicianId,
        oldStatus,
        newStatus,
        comment,
        closeCategory,
      }),
    );

    return Result.ok(undefined);
  }

  /** Añade un comentario a la cita; debe ser el técnico asignado. */
  addComment(technicianId: TechnicianId, comment: string): Result<void> {
    if (
      !this._currentTechnicianId ||
      this._currentTechnicianId !== technicianId
    ) {
      return Result.err(
        new AppointmentTechnicianNotAuthorizedError(
          technicianId,
          'add comments to this appointment',
        ),
      );
    }

    if (comment.length > APPOINTMENT_CONSTANTS.MAX_COMMENT_LENGTH) {
      return Result.err(
        new Error(
          `Comment cannot exceed ${APPOINTMENT_CONSTANTS.MAX_COMMENT_LENGTH} characters`,
        ),
      );
    }

    this._comment = comment;

    this.addEvent(
      new DomainEvent('APPOINTMENT_COMMENT_ADDED', this._id, 'Appointment', {
        technicianId,
        comment,
      }),
    );

    return Result.ok(undefined);
  }

  /** Asigna un locker durante el ciclo de vida de la cita. No en estados terminales. */
  assignLocker(lockerId: LockerId): Result<void> {
    const terminalStatuses = [
      AppointmentStatus.CANCELED,
      AppointmentStatus.CLOSED,
      AppointmentStatus.VALIDATED,
      AppointmentStatus.PENDING_PICKUP,
      AppointmentStatus.PENDING_REPLACEMENT_DELIVERY,
    ];
    if (terminalStatuses.includes(this._status)) {
      return Result.err(
        new InvalidAppointmentStateError(this._status, 'assign locker'),
      );
    }

    this._lockerId = lockerId;
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_LOCKER_ASSIGNED', this._id, 'Appointment', {
        lockerId: lockerId as string,
      }),
    );

    return Result.ok(undefined);
  }

  /** Libera el locker asignado a la cita. */
  releaseLocker(): Result<void> {
    if (!this._lockerId) {
      return Result.err(new Error('No locker assigned to this appointment'));
    }

    const releasedLockerId = this._lockerId;
    this._lockerId = null;
    this._updatedAt = new Date();

    this.addEvent(
      new DomainEvent('APPOINTMENT_LOCKER_RELEASED', this._id, 'Appointment', {
        lockerId: releasedLockerId as string,
      }),
    );

    return Result.ok(undefined);
  }

  /** @internal Añade un evento al buffer de eventos pendientes de publicar (outbox). */
  private addEvent(event: DomainEvent): void {
    this._events.push(event);
  }

  /**
   * Extrae y vacía el buffer de eventos de dominio pendientes de publicar.
   * Debe llamarse tras guardar el agregado para publicar los eventos al bus.
   */
  pullEvents(): DomainEvent[] {
    const events = [...this._events];
    this._events = [];
    return events;
  }

  toJSON() {
    return {
      id: this._id,
      issueId: this._issueId,
      issueTypeId: this._issueTypeId,
      issueType: this._issueTypeInfo ?? undefined,
      kind: this._kind,
      customerId: this._customerId,
      customer: this._customerInfo ?? undefined,
      companyId: this._companyId,
      cornerId: this._cornerId,
      corner: this._cornerInfo ?? undefined,
      slotIds: this._slotIds,
      scheduledRange: this._scheduledRange,
      durationMinutes: this._durationMinutes,
      status: this._status,
      origin: this._origin,
      priority: this._priority,
      currentTechnicianId: this._currentTechnicianId,
      technician: this._technicianInfo ?? undefined,
      createdByTechnicianId: this._createdByTechnicianId,
      deviceId: this._deviceId,
      device: this._deviceInfo ?? undefined,
      lockerId: this._lockerId,
      metadata: this._metadata,
      closedAt: this._closedAt,
      comment: this._comment,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      estimatedCloseAt: this._estimatedCloseAt,
    };
  }

  static create(
    id: AppointmentId,
    issueTypeId: IssueTypeId,
    kind: AppointmentKind,
    customerId: CustomerId,
    companyId: CompanyId,
    cornerId: CornerId,
    slotIds: SlotId[],
    scheduledRange: DateRange,
    origin: AppointmentOrigin,
    createdByTechnicianId: TechnicianId | null = null,
    metadata: Record<string, any> = {},
    estimatedCloseAt: Date | null = null,
    /** Email del técnico que crea la cita (kind=ISSUE, vía creatorExternalId) — viaja solo en el evento, no se persiste en el aggregate. */
    creatorTechnicianEmail: string | null = null,
  ): Result<Appointment> {
    if (slotIds.length === 0) {
      return Result.err(new Error('Appointment must occupy at least one slot'));
    }

    const duration = scheduledRange.getDurationMinutes();
    if (
      duration < APPOINTMENT_CONSTANTS.MIN_DURATION_MINUTES ||
      duration > APPOINTMENT_CONSTANTS.MAX_DURATION_MINUTES
    ) {
      return Result.err(
        new Error(
          `Duration must be between ${APPOINTMENT_CONSTANTS.MIN_DURATION_MINUTES} and ${APPOINTMENT_CONSTANTS.MAX_DURATION_MINUTES} minutes`,
        ),
      );
    }

    const now = new Date();
    const appointment = new Appointment(
      id,
      issueTypeId,
      kind,
      customerId,
      companyId,
      cornerId,
      slotIds,
      scheduledRange,
      duration,
      AppointmentStatus.CREATED,
      origin,
      APPOINTMENT_CONSTANTS.DEFAULT_PRIORITY,
      null,
      createdByTechnicianId,
      null,
      null,
      metadata,
      null,
      null,
      now,
      now,
      null,
      estimatedCloseAt,
    );

    // A diferencia de Request.create() hoy (que nunca emitía eventos),
    // Appointment.create() SIEMPRE emite APPOINTMENT_CREATED — esto es lo
    // que corrige el bug donde las citas kind=REQUEST nunca generaban
    // ticket real en ServiceNow (ver appointment-servicenow.handler.ts, Fase 4).
    appointment.addEvent(
      new DomainEvent('APPOINTMENT_CREATED', id, 'Appointment', {
        issueTypeId,
        kind,
        customerId,
        companyId,
        cornerId,
        slotIds,
        scheduledStart: scheduledRange.start,
        scheduledEnd: scheduledRange.end,
        origin,
        createdByTechnicianId,
        creatorTechnicianEmail,
      }),
    );

    return Result.ok(appointment);
  }

  /**
   * Reconstruye un `Appointment` desde persistencia sin validaciones de dominio.
   * Usar exclusivamente en la capa de repositorio.
   */
  static reconstitute(
    id: AppointmentId,
    issueTypeId: IssueTypeId,
    kind: AppointmentKind,
    customerId: CustomerId,
    companyId: CompanyId,
    cornerId: CornerId,
    slotIds: SlotId[],
    scheduledRange: DateRange,
    durationMinutes: number,
    status: AppointmentStatus,
    origin: AppointmentOrigin,
    priority: number,
    currentTechnicianId: TechnicianId | null,
    createdByTechnicianId: TechnicianId | null,
    deviceId: string | null,
    lockerId: LockerId | null,
    metadata: Record<string, any>,
    closedAt: Date | null,
    comment: string | null,
    createdAt: Date,
    updatedAt: Date,
    issueId: number | null = null,
    estimatedCloseAt: Date | null = null,
  ): Appointment {
    return new Appointment(
      id,
      issueTypeId,
      kind,
      customerId,
      companyId,
      cornerId,
      slotIds,
      scheduledRange,
      durationMinutes,
      status,
      origin,
      priority,
      currentTechnicianId,
      createdByTechnicianId,
      deviceId,
      lockerId,
      metadata,
      closedAt,
      comment,
      createdAt,
      updatedAt,
      issueId,
      estimatedCloseAt,
    );
  }
}
