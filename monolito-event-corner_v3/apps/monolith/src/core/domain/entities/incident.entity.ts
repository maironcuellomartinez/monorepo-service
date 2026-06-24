// core/domain/entities/incident.entity.ts
import { DateRange } from '../value-objects/date-range.value';
import { IncidentStatus } from '../enums/incident-status.enum';
import { IncidentOrigin } from '../enums/incident-origin.enum';
import { TimelineAction } from '../enums/timeline-action.enum';

import {
    IncidentNotAvailableError,
    InvalidIncidentStateError,
    TechnicianNotAuthorizedError
} from '../errors/incident.errors';
import { INCIDENT_CONSTANTS } from '../constants/incident.constants';
import { TAKEABLE_STATUSES } from '../enums/incident-status.enum';
import { Result } from '@app/result';
import { IncidentId } from '@app/shared/types/incident-types';
import { CornerId, CustomerId, IssueTypeId, LockerId, SlotId, TechnicianId } from '@app/shared/types/branded-ids';
import { ServiceNowId } from '../value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../value-objects/servicenow-number.value';
import { DomainEvent } from '@app/shared/domain-event';

export class Incident {
    private _events: DomainEvent[] = [];

    private constructor(
        private readonly _id: IncidentId,
        private _issueTypeId: IssueTypeId,
        private _customerId: CustomerId,
        private _cornerId: CornerId,
        private _slotIds: SlotId[],
        private _scheduledRange: DateRange,
        private _durationMinutes: number,
        private _status: IncidentStatus,
        private _origin: IncidentOrigin,
        private _priority: number,
        private _currentTechnicianId: TechnicianId | null,
        private _deviceId: string | null,
        private _lockerId: LockerId | null,
        private _servicenowId: ServiceNowId | null,
        private _servicenowNumber: ServiceNowNumber | null,
        private _metadata: Record<string, any>,
        private _closedAt: Date | null,
        private _comment: string | null,
        private readonly _createdAt: Date,
        private _updatedAt: Date,
        private _snowqCorrelationId: string | null = null,
    ) { }

    // Enriched device info (populated from DB relation, not persisted)
    private _deviceInfo: { serialNumber: string; model: string | null; brand: string | null } | null = null;
    setDeviceInfo(info: { serialNumber: string; model: string | null; brand: string | null } | null) {
        this._deviceInfo = info;
    }

    // Enriched customer info (populated from DB relation, not persisted)
    private _customerInfo: { id: string; email: string | null; name: string | null } | null = null;
    setCustomerInfo(info: { id: string; email: string | null; name: string | null } | null) {
        this._customerInfo = info;
    }

    // Getters
    get id(): IncidentId { return this._id; }
    get status(): IncidentStatus { return this._status; }
    get scheduledRange(): DateRange { return this._scheduledRange; }
    get currentTechnicianId(): TechnicianId | null { return this._currentTechnicianId; }
    get cornerId(): CornerId { return this._cornerId; }
    get customerId(): CustomerId { return this._customerId; }
    get slotIds(): SlotId[] { return [...this._slotIds]; }
    get durationMinutes(): number { return this._durationMinutes; }
    get issueTypeId(): IssueTypeId { return this._issueTypeId; }
    get lockerId(): LockerId | null { return this._lockerId; }
    get deviceId(): string | null { return this._deviceId; }

    attachDevice(deviceId: string): void {
        this._deviceId = deviceId;
    }
    get priority(): number { return this._priority; }
    get origin(): IncidentOrigin { return this._origin; }
    get metadata(): Record<string, any> { return this._metadata; }
    get servicenowId(): ServiceNowId | null { return this._servicenowId; }
    get servicenowNumber(): ServiceNowNumber | null { return this._servicenowNumber; }
    get comment(): string | null { return this._comment; }
    get closedAt(): Date | null { return this._closedAt; }
    get createdAt(): Date { return this._createdAt; }
    get updatedAt(): Date { return this._updatedAt; }

    /**
     * @internal
     * @returns {string | null} El correlationId de api-snowq-service.
     * @description Obtiene el correlationId de api-snowq-service. Este valor se usa para identificar el ticket en api-snowq-service.
     */
    get snowqCorrelationId(): string | null { return this._snowqCorrelationId; }

    /**
     * @internal
     * @param {string | null} correlationId - El correlationId de api-snowq-service.
     * @example
     * ```typescript
     *      incident.setSnowqCorrelationId('correlationId');
     * ```
     * @description Persiste el correlationId de api-snowq-service cuando el ticket fue encolado; null para limpiar.
     */
    setSnowqCorrelationId(correlationId: string | null): void {
        this._snowqCorrelationId = correlationId;
        this._updatedAt = new Date();
    }

    // Métodos de negocio con Result

    /**
     * Indica si el incidente está disponible para ser tomado.
     * @returns {boolean} `true` si el estado es `CREATED` y la fecha de inicio es futura.
     * @example
     * ```typescript
     * if (incident.isCreated()) {
     *   console.log('Disponible para tomar');
     * }
     * ```
     */
    isCreated(): boolean {
        return this._status === IncidentStatus.CREATED && this._scheduledRange.start > new Date();
    }

    /**
     * Indica si el incidente está disponible para ser tomado.
     * @returns {boolean} `true` si el estado es `CREATED` y la fecha de inicio es futura.
     * @example
     * ```typescript
     * if (incident.isAvailableForTaking()) {
     *   console.log('Disponible para tomar');
     * }
     * ```
     * @description Indica si el incidente está disponible para ser tomado por un técnico.
     */
    isAvailableForTaking(): boolean {
        return TAKEABLE_STATUSES.includes(this._status) && !this._currentTechnicianId;
    }

    /**
     * Indica si el incidente puede ser tomado por un técnico.
     * @param _technicianId - ID del técnico que intenta tomar el incidente.
     * @returns {boolean} `true` si el incidente está en estado `CREATED` y la fecha de inicio es futura.
     * @example
     * ```typescript
     * if (incident.canBeTakenBy(technicianId)) {
     *   console.log('Disponible para tomar');
     * }
     * ```
     * @description Indica si el incidente puede ser tomado por un técnico.
     */
    canBeTakenBy(_technicianId: TechnicianId): boolean {
        return this.isAvailableForTaking();
    }

    /**
     * Registra la entrega del dispositivo por parte del cliente.
     * @param {TechnicianId} technicianId - ID del técnico que recibe el dispositivo.
     * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
     * @throws {IncidentNotAvailableError} Si el incidente no está en estado `CREATED`.
     * @example
     * ```typescript
     * const result = incident.deliver(technicianId);
     * if (result.isFailure) {
     *   console.error(result.unwrapError().message);
     * }
     * ```
     * @description Registra la entrega del dispositivo por parte del cliente.
     * Transición: CREATED → DELIVERED.
     * Puede ser ejecutado por el técnico que recibe o por la consigna.
     */
    deliver(technicianId: TechnicianId): Result<void> {
        if (this._status !== IncidentStatus.CREATED) {
            return Result.err(new InvalidIncidentStateError(this._status, 'deliver (must be CREATED)'));
        }

        this._status = IncidentStatus.DELIVERED;
        this._currentTechnicianId = technicianId;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_DELIVERED', this._id as string, 'Incident', {
            technicianId, previousStatus: IncidentStatus.CREATED,
        }));

        return Result.ok(undefined);
    }

    /**
     * Cualquier técnico puede tomar cualquier incidencia no terminal.
     * Solo cambia el técnico asignado — el estado NO cambia.
     */
    take(technicianId: TechnicianId): Result<void> {
        if (!this.isAvailableForTaking()) {
            return Result.err(new IncidentNotAvailableError(this._id));
        }

        const previousTechnicianId = this._currentTechnicianId;
        this._currentTechnicianId = technicianId;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_TAKEN', this._id as string, 'Incident', {
            technicianId, previousTechnicianId, currentStatus: this._status,
        }));

        return Result.ok(undefined);
    }

    /**
     * Libera el incidente, devolviéndolo al estado `CREATED` y desasignando al técnico.
     * @param {TechnicianId} technicianId - ID del técnico que libera el incidente.
     * @param {string} [reason] - Motivo opcional de la liberación (ej. "Cambio de turno").
     * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
     * @throws {InvalidIncidentStateError} Si el incidente no está en estado `IN_PROGRESS` o `PAUSED`.
     * @description
     * Solo los incidentes en estado `IN_PROGRESS` o `PAUSED` pueden liberarse.
     * Tras la liberación, el incidente queda de nuevo disponible para cualquier técnico.
     * @example
     * ```typescript
     * const result = incident.release(technicianId, 'Cambio de turno');
     * if (result.isSuccess) {
     *   console.log('Incidente liberado, estado:', incident.status); // CREATED
     * }
     * ```
     */
    /**
     * Libera la incidencia: quita el técnico asignado sin asignar otro.
     * Cualquier técnico puede liberar cualquier incidencia activa.
     */
    release(technicianId: TechnicianId, reason?: string): Result<void> {
        if (!TAKEABLE_STATUSES.includes(this._status)) {
            return Result.err(new InvalidIncidentStateError(this._status, 'release'));
        }

        const previousTechnicianId = this._currentTechnicianId;
        this._currentTechnicianId = null;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_RELEASED', this._id as string, 'Incident', {
            technicianId, reason, previousTechnicianId,
        }));

        return Result.ok(undefined);
    }

    /**
     * Valida la solución del incidente.
     * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
     * @throws {InvalidIncidentStateError} Si el incidente no está en estado `CLOSED`.
     * @description
     * Solo los incidentes en estado `CLOSED` pueden validarse.
     * Tras la validación, el incidente pasa al estado `VALIDATED`.
     * @example
     * ```typescript
     * const result = incident.validate();
     * if (result.isSuccess) {
     *   console.log('Incidente validado, estado:', incident.status); // VALIDATED
     * }
     * ```
     */
    validate(): Result<void> {
        if (this._status !== IncidentStatus.CLOSED) {
            return Result.err(new InvalidIncidentStateError(this._status, 'validate (must be CLOSED)'));
        }

        this._status = IncidentStatus.VALIDATED;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_VALIDATED', this._id as string, 'Incident'));

        return Result.ok(undefined);
    }

    /**
     * Reabre el incidente.
     * @param {string} [reason] - Motivo opcional de la reapertura (ej. "Solución no aceptada").
     * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
     * @throws {InvalidIncidentStateError} Si el incidente no está en estado `CLOSED`.
     * @description
     * Solo los incidentes en estado `CLOSED` pueden reabrirse.
     * Tras la reapertura, el incidente vuelve al estado `REOPENED` y queda disponible para cualquier técnico.
     * @example
     * ```typescript
     * const result = incident.reopen('Solución no aceptada');
     * if (result.isSuccess) {
     *   console.log('Incidente reabierto, estado:', incident.status); // REOPENED
     * }
     * ```
     */
    reopen(reason?: string): Result<void> {
        if (this._status !== IncidentStatus.CLOSED) {
            return Result.err(new InvalidIncidentStateError(this._status, 'reopen (must be CLOSED)'));
        }

        this._status = IncidentStatus.REOPENED;
        this._currentTechnicianId = null;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_REOPENED', this._id as string, 'Incident', { reason }));

        return Result.ok(undefined);
    }

    /**
     * Vincula el incidente con el ticket creado en ServiceNow.
     * @param {ServiceNowId} servicenowId - `sys_id` del ticket en ServiceNow.
     * @param {ServiceNowNumber} servicenowNumber - Número legible del ticket (ej. `INC0012345`).
     * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
     * @description
     * Se invoca una vez que la integración con ServiceNow ha creado el ticket
     * y devuelve el `sys_id` y el número. Registra un evento de auditoría.
     * @example
     * ```typescript
     * const sysId = ServiceNowId.create('abc123def456');
     * const number = ServiceNowNumber.create('INC0012345');
     * const result = incident.updateServiceNowInfo(sysId.unwrap(), number.unwrap());
     * ```
     */
    updateServiceNowInfo(servicenowId: ServiceNowId, servicenowNumber: ServiceNowNumber): Result<void> {
        this._servicenowId = servicenowId;
        this._servicenowNumber = servicenowNumber;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_SERVICENOW_UPDATED', this._id as string, 'Incident', {
            servicenowId: servicenowId.value, servicenowNumber: servicenowNumber.value,
        }));

        return Result.ok(undefined);
    }

    /**
     * Devuelve los campos base del incidente para construir un ticket en ServiceNow.
     * @returns {Record<string, any>} Objeto con los campos del ticket. Los campos dependientes
     * de entidades relacionadas (`company_sys_id`, `category`, `assignment_group`, `location`)
     * se completan desde el servicio de integración usando `Company`, `IssueType`, `CompanyIssueConfig` y `Corner`.
     * @description
     * Este método solo proporciona los datos que pertenecen al propio incidente.
     * El servicio `ServiceNowIntegrationService` se encarga de enriquecer el objeto
     * con los datos de las entidades relacionadas antes de enviarlo a ServiceNow.
     * @example
     * ```typescript
     * const base = incident.getServiceNowTicketInfo();
     * // base.short_description => 'inc_123 - averia_portatil'
     * // base.expected_start    => Date
     * ```
     */
    getServiceNowTicketInfo(): Record<string, any> {
        return {
            // Estos campos se llenarán desde las entidades relacionadas
            // (Company, IssueType, CompanyIssueConfig, Corner)
            company_sys_id: null, // Se llena desde Company
            category: null,       // Se llena desde IssueType
            assignment_group: null, // Se llena desde CompanyIssueConfig
            location: null,       // Se llena desde Corner
            short_description: `${this._id} - ${this._issueTypeId}`,
            description: `Incident created for customer on ${this._scheduledRange.start}`,
            caller_id: this._customerId,
            expected_start: this._scheduledRange.start
        };
    }

    /**
     * Cambia el estado del incidente aplicando la máquina de estados definida en `INCIDENT_CONSTANTS`.
     * @param {IncidentStatus} newStatus - Nuevo estado destino.
     * @param {TechnicianId} technicianId - ID del técnico que realiza el cambio; debe ser el técnico actualmente asignado.
     * @param {string} [comment] - Comentario opcional que se registra en el evento de auditoría.
     * @returns {Result<void>} `Result.ok` si la transición es válida y se aplica con éxito.
     * @throws {TechnicianNotAuthorizedError} Si el técnico no es el actualmente asignado al incidente.
     * @throws {InvalidIncidentStateError} Si la transición desde el estado actual al estado destino no está permitida.
     * @description
     * Las transiciones válidas están definidas en `INCIDENT_CONSTANTS.VALID_STATUS_TRANSITIONS`.
     * Solo el técnico asignado puede cambiar el estado. Si el nuevo estado es `CLOSED`,
     * se registra automáticamente la fecha de cierre.
     * @example
     * ```typescript
     * // Pasar de IN_PROGRESS a PAUSED
     * const result = incident.changeStatus(
     *   IncidentStatus.PAUSED,
     *   technicianId,
     *   'Esperando repuesto de pantalla'
     * );
     * if (result.isFailure) {
     *   console.error(result.unwrapError().message);
     * }
     * ```
     */
    /**
     * Cualquier técnico puede cambiar el estado de cualquier incidencia.
     * Solo se valida que la transición sea válida según la máquina de estados.
     */
    changeStatus(newStatus: IncidentStatus, technicianId: TechnicianId, comment?: string, closeCategory?: string): Result<void> {
        // Validar transición válida
        const validTransitions = (INCIDENT_CONSTANTS.VALID_STATUS_TRANSITIONS as Record<string, readonly string[]>)[this._status] ?? [];

        if (!validTransitions.includes(newStatus)) {
            return Result.err(new InvalidIncidentStateError(this._status, `transition to ${newStatus}`));
        }

        const oldStatus = this._status;
        this._status = newStatus;
        this._updatedAt = new Date();

        if (newStatus === IncidentStatus.CLOSED) {
            this._closedAt = new Date();
            this._currentTechnicianId = null;
        }

        if (newStatus === IncidentStatus.CANCELED) {
            this._currentTechnicianId = null;
        }

        this.addEvent(new DomainEvent('INCIDENT_STATUS_CHANGED', this._id as string, 'Incident', {
            technicianId, oldStatus, newStatus, comment, closeCategory,
        }));

        return Result.ok(undefined);
    }

    /**
     * Añade un comentario al incidente y lo registra en el historial de eventos.
     * @param {TechnicianId} technicianId - ID del técnico que escribe el comentario; debe ser el técnico asignado.
     * @param {string} comment - Texto del comentario. Máximo `INCIDENT_CONSTANTS.MAX_COMMENT_LENGTH` caracteres.
     * @returns {Result<void>} `Result.ok` si el comentario se añadió con éxito.
     * @throws {TechnicianNotAuthorizedError} Si el técnico no es el actualmente asignado al incidente.
     * @throws {Error} Si el comentario supera la longitud máxima permitida.
     * @example
     * ```typescript
     * const result = incident.addComment(technicianId, 'Revisando la placa base');
     * if (result.isSuccess) {
     *   console.log('Comentario registrado');
     * }
     * ```
     */
    addComment(technicianId: TechnicianId, comment: string): Result<void> {
        if (!this._currentTechnicianId || this._currentTechnicianId !== technicianId) {
            return Result.err(new TechnicianNotAuthorizedError(technicianId, 'add comments to this incident'));
        }

        if (comment.length > INCIDENT_CONSTANTS.MAX_COMMENT_LENGTH) {
            return Result.err(new Error(`Comment cannot exceed ${INCIDENT_CONSTANTS.MAX_COMMENT_LENGTH} characters`));
        }

        this._comment = comment;

        this.addEvent(new DomainEvent('INCIDENT_COMMENT_ADDED', this._id as string, 'Incident', { technicianId, comment }));

        return Result.ok(undefined);
    }

    /**
     * Comprueba si el incidente ocupa un slot concreto.
     * @param {SlotId} slotId - ID del slot a verificar.
     * @returns {boolean} `true` si el slot forma parte de los slots reservados por este incidente.
     * @example
     * ```typescript
     * if (incident.occupiesSlot(slotId)) {
     *   console.log('El slot está ocupado por este incidente');
     * }
     * ```
     */
    occupiesSlot(slotId: SlotId): boolean {
        return this._slotIds.some(id => id === slotId);
    }

    /**
     * Asigna un locker a la incidencia durante su ciclo de vida.
     * No se puede asignar en estados terminales (CANCELED, CLOSED, VALIDATED).
     */
    assignLocker(lockerId: LockerId): Result<void> {
        const terminalStatuses = [IncidentStatus.CANCELED, IncidentStatus.CLOSED, IncidentStatus.VALIDATED, IncidentStatus.PENDING_PICKUP, IncidentStatus.PENDING_REPLACEMENT_DELIVERY];
        if (terminalStatuses.includes(this._status)) {
            return Result.err(new InvalidIncidentStateError(this._status, 'assign locker'));
        }

        this._lockerId = lockerId;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_LOCKER_ASSIGNED', this._id as string, 'Incident', {
            lockerId: lockerId as string,
        }));

        return Result.ok(undefined);
    }

    /**
     * Libera el locker asignado a la incidencia.
     */
    releaseLocker(): Result<void> {
        if (!this._lockerId) {
            return Result.err(new Error('No locker assigned to this incident'));
        }

        const releasedLockerId = this._lockerId;
        this._lockerId = null;
        this._updatedAt = new Date();

        this.addEvent(new DomainEvent('INCIDENT_LOCKER_RELEASED', this._id as string, 'Incident', {
            lockerId: releasedLockerId as string,
        }));

        return Result.ok(undefined);
    }

    /**
     * @internal Añade un evento al buffer de eventos pendientes de publicar.
     * @param {IncidentEvent} event - Evento de dominio a registrar.
     */
    private addEvent(event: DomainEvent): void {
        this._events.push(event);
    }

    /**
     * Extrae y vacía el buffer de eventos de dominio pendientes de publicar.
     * Debe llamarse tras guardar el agregado para publicar los eventos al bus.
     * @returns {IncidentEvent[]} Lista de eventos generados desde la última llamada a `pullEvents`.
     * @example
     * ```typescript
     *  await incidentRepo.save(incident);
     *  const events = incident.pullEvents();
     *  await eventBus.publishMany(events);
     * ```
     */
    pullEvents(): DomainEvent[] {
        const events = [...this._events];
        this._events = [];
        return events;
    }

    /**
     * Crea una nueva instancia de `Incident` con validaciones de dominio.
     * @param {IncidentId} id - ID único del incidente.
     * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
     * @param {CustomerId} customerId - ID del usuario que crea la cita.
     * @param {CornerId} cornerId - ID del corner donde se atenderá.
     * @param {SlotId[]} slotIds - IDs de los slots que ocupa el incidente (mínimo 1).
     * @param {DateRange} scheduledRange - Rango de fecha/hora de la cita.
     * @param {IncidentOrigin} origin - Canal de origen (ej. `CUSTOMER_APP`, `TECHNICIAN_APP`).
     * @param {Record<string, any>} [metadata={}] - Metadatos adicionales opcionales.
     * @returns {Result<Incident>} `Result.ok` con el incidente creado, o `Result.err` si la validación falla.
     * @throws {Error} Si `slotIds` está vacío o la duración está fuera del rango permitido.
     * @example
     * ```typescript
     * const result = Incident.create(
     *   incidentId, issueTypeId, customerId, cornerId,
     *   [slotId1, slotId2], dateRange, IncidentOrigin.CUSTOMER_APP
     * );
     * if (result.isSuccess) {
     *   const incident = result.unwrap();
     * }
     * ```
     */
    toJSON() {
        return {
            id: this._id,
            issueTypeId: this._issueTypeId,
            customerId: this._customerId,
            customer: this._customerInfo ?? undefined,
            cornerId: this._cornerId,
            slotIds: this._slotIds,
            scheduledRange: this._scheduledRange,
            durationMinutes: this._durationMinutes,
            status: this._status,
            origin: this._origin,
            priority: this._priority,
            currentTechnicianId: this._currentTechnicianId,
            deviceId: this._deviceId,
            device: this._deviceInfo ?? undefined,
            lockerId: this._lockerId,
            servicenowId: this._servicenowId,
            servicenowNumber: this._servicenowNumber,
            metadata: this._metadata,
            closedAt: this._closedAt,
            comment: this._comment,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            snowqCorrelationId: this._snowqCorrelationId,
        };
    }

    static create(
        id: IncidentId,
        issueTypeId: IssueTypeId,
        customerId: CustomerId,
        cornerId: CornerId,
        slotIds: SlotId[],
        scheduledRange: DateRange,
        origin: IncidentOrigin,
        metadata: Record<string, any> = {}
    ): Result<Incident> {
        // Validaciones
        if (slotIds.length === 0) {
            return Result.err(new Error('Incident must occupy at least one slot'));
        }

        const duration = scheduledRange.getDurationMinutes();
        if (duration < INCIDENT_CONSTANTS.MIN_DURATION_MINUTES ||
            duration > INCIDENT_CONSTANTS.MAX_DURATION_MINUTES) {
            return Result.err(new Error(`Duration must be between ${INCIDENT_CONSTANTS.MIN_DURATION_MINUTES} and ${INCIDENT_CONSTANTS.MAX_DURATION_MINUTES} minutes`));
        }

        const now = new Date();
        const incident = new Incident(
            id,
            issueTypeId,
            customerId,
            cornerId,
            slotIds,
            scheduledRange,
            duration,
            IncidentStatus.CREATED,
            origin,
            INCIDENT_CONSTANTS.DEFAULT_PRIORITY,
            null,
            null,
            null,
            null,
            null,
            metadata,
            null,
            null,
            now,
            now
        );

        incident.addEvent(new DomainEvent('INCIDENT_CREATED', id as string, 'Incident', {
            issueTypeId, customerId, cornerId, slotIds,
            scheduledStart: scheduledRange.start,
            scheduledEnd: scheduledRange.end,
            origin,
        }));

        return Result.ok(incident);
    }

    /**
     * Reconstruye un `Incident` reproduciéndole su secuencia de eventos (Event Sourcing).
     * @param {IncidentEvent[]} events - Lista de eventos de dominio ordenables por `timestamp`.
     * @returns {Result<Incident>} `Result.ok` con el incidente reconstruido, o `Result.err` si la lista está vacía
     * o no contiene un evento de creación.
     * @description
     * Los eventos se ordenan por `timestamp` antes de aplicarse. El primer evento debe ser
     * `INCIDENT_CREATED`; los siguientes pueden ser `INCIDENT_TAKEN`, `INCIDENT_RELEASED`
     * o `INCIDENT_STATUS_CHANGED`. Útil para reconstruir el agregado desde un event store.
     * @example
     * ```typescript
     * const events = await eventStore.findByIncidentId(incidentId);
     * const result = Incident.fromEvents(events);
     * if (result.isSuccess) {
     *   const incident = result.unwrap();
     * }
     * ```
     */
    /**
     * Reconstruye un `Incident` desde persistencia sin validaciones de dominio.
     * Usar exclusivamente en la capa de repositorio.
     */
    static reconstitute(
        id: IncidentId,
        issueTypeId: IssueTypeId,
        customerId: CustomerId,
        cornerId: CornerId,
        slotIds: SlotId[],
        scheduledRange: DateRange,
        durationMinutes: number,
        status: IncidentStatus,
        origin: IncidentOrigin,
        priority: number,
        currentTechnicianId: TechnicianId | null,
        deviceId: string | null,
        lockerId: LockerId | null,
        servicenowId: ServiceNowId | null,
        servicenowNumber: ServiceNowNumber | null,
        metadata: Record<string, any>,
        closedAt: Date | null,
        comment: string | null,
        createdAt: Date,
        updatedAt: Date,
        snowqCorrelationId: string | null = null,
    ): Incident {
        return new Incident(
            id, issueTypeId, customerId, cornerId, slotIds, scheduledRange,
            durationMinutes, status, origin, priority, currentTechnicianId,
            deviceId, lockerId, servicenowId, servicenowNumber, metadata,
            closedAt, comment, createdAt, updatedAt, snowqCorrelationId,
        );
    }

    /**
     * Reconstruye un `Incident` desde persistencia sin validaciones de dominio.
     * Usar exclusivamente en la capa de repositorio.
     * @param events Lista de eventos ordenados por timestamp.
     * @returns {Result<Incident>} `Result.ok` con el incidente reconstruido, o `Result.err` si no hay eventos.
     * @example
     * ```typescript
     * const events = await eventStore.findByIncidentId(incidentId);
     * const result = Incident.fromEvents(events);
     * if (result.isSuccess) {
     *   const incident = result.unwrap();
     * }
     * ```
     * @description No valida que el incidente sea válido, solo reconstruye el estado.
     */
    static fromEvents(events: DomainEvent[]): Result<Incident> {
        if (events.length === 0) {
            return Result.err(new Error('Cannot reconstruct from empty events'));
        }

        // Ordenar por timestamp
        const sortedEvents = [...events].sort((a, b) =>
            a.timestamp.getTime() - b.timestamp.getTime()
        );

        let incident: Incident | null = null;

        for (const event of sortedEvents) {
            switch (event.type) {
                case 'INCIDENT_CREATED':
                    const createResult = this.replayCreated(event);
                    if (createResult.isFailure) return Result.err(createResult.unwrapError());
                    incident = createResult.unwrap();
                    break;
                case 'INCIDENT_TAKEN':
                    if (incident) incident.replayTaken(event);
                    break;
                case 'INCIDENT_RELEASED':
                    if (incident) incident.replayReleased(event);
                    break;
                case 'INCIDENT_STATUS_CHANGED':
                    if (incident) incident.replayStatusChanged(event);
                    break;
                case 'INCIDENT_VALIDATED':
                    if (incident) incident.replayStatusChanged({ ...event, data: { newStatus: IncidentStatus.VALIDATED } });
                    break;
                case 'INCIDENT_REOPENED':
                    if (incident) incident.replayReopened(event);
                    break;
            }
        }

        if (!incident) {
            return Result.err(new Error('No creation event found'));
        }

        return Result.ok(incident);
    }

    /**
     * @internal Reconstituye el estado inicial del incidente a partir del evento `INCIDENT_CREATED`.
     * @param {IncidentEvent} event - Evento de creación con los datos originales del incidente.
     * @returns {Result<Incident>} Instancia de `Incident` en estado `CREATED`.
     */
    private static replayCreated(event: DomainEvent): Result<Incident> {
        const data = event.data;
        const scheduledRange = DateRange.reconstitute(
            new Date(data.scheduledStart),
            new Date(data.scheduledEnd)
        );
        const now = event.timestamp;
        const incident = new Incident(
            event.aggregateId as IncidentId,
            data.issueTypeId,
            data.customerId,
            data.cornerId,
            data.slotIds,
            scheduledRange,
            scheduledRange.getDurationMinutes(),
            IncidentStatus.CREATED,
            data.origin,
            INCIDENT_CONSTANTS.DEFAULT_PRIORITY,
            null,
            null,
            null,
            null,
            null,
            {},
            null,
            null,
            now,
            now
        );
        return Result.ok(incident);
    }

    /**
     * @internal Aplica el evento `INCIDENT_TAKEN` al estado del agregado.
     * @param {IncidentEvent} event - Evento que contiene el `technicianId` que tomó el incidente.
     * @description Solo asigna el técnico; no cambia el estado del incidente ni agrega eventos.
     */
    private replayTaken(event: DomainEvent): void {
        this._currentTechnicianId = event.data.technicianId as TechnicianId;
        this._updatedAt = event.timestamp;
    }

    /**
     * @internal Aplica el evento `INCIDENT_RELEASED` al estado del agregado.
     * @param {IncidentEvent} event - Evento de liberación del incidente.
     * @description Cambia el estado del incidente a `CREATED` o `REOPENED` según el valor de `returnedTo`.
     */
    private replayReleased(event: DomainEvent): void {
        this._status = event.data.returnedTo ?? IncidentStatus.CREATED;
        this._currentTechnicianId = null;
        this._updatedAt = event.timestamp;
    }

    /**
     * @internal Aplica el evento `INCIDENT_REOPENED` al estado del agregado.
     * @param {IncidentEvent} event - Evento de reapertura del incidente.
     * @description Cambia el estado del incidente a `REOPENED` y asigna el técnico que lo reabrió.
     */
    private replayReopened(event: DomainEvent): void {
        this._status = IncidentStatus.REOPENED;
        this._currentTechnicianId = event.data.technicianId as TechnicianId;
        this._updatedAt = event.timestamp;
    }

    /**
     * @internal Aplica el evento `INCIDENT_STATUS_CHANGED` al estado del agregado.
     * @param {IncidentEvent} event - Evento con el nuevo estado (`event.data.newStatus`).
     * @description Cambia el estado del incidente al nuevo estado y actualiza el timestamp.
     */
    private replayStatusChanged(event: DomainEvent): void {
        this._status = event.data.newStatus;
        this._updatedAt = event.timestamp;
        if (event.data.newStatus === IncidentStatus.CLOSED) {
            this._closedAt = event.timestamp;
        }
    }
}