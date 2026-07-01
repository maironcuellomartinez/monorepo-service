// core/services/incident/incident.service.ts
import { Injectable } from '@nestjs/common';
import { isFail, Result } from '@app/result';
import { LoggerService, TracingService } from '@app/observability';
import { IIncidentService, CreateIncidentCommand, DeliverIncidentCommand, TakeIncidentCommand, ReleaseIncidentCommand, ChangeIncidentStatusCommand, ValidateIncidentCommand, ReopenIncidentCommand, CancelIncidentCommand, BatchStatusChangeItem, BatchChangeResult } from '../../ports/incoming/incident/incident-service.port';
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
import { IncidentId, TechnicianId, CornerId, CustomerId, IssueTypeId, SlotId, UserId, CompanyId } from '../../domain/value-objects/ids';
import { DateRange } from '../../domain/value-objects/date-range.value';
import { IncidentOrigin } from '../../domain/enums/incident-origin.enum';
import { IncidentStatus } from '../../domain/enums/incident-status.enum';
import { IssueTypeNotAllowedForCompanyError } from '@app/shared/errors/domain-error';

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
    ) { }

    async createIncident(command: CreateIncidentCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.createIncident',
            { kind: 'server', attributes: { 'incident.customerId': command.customerId, 'incident.cornerId': command.cornerId, 'incident.issueTypeId': command.issueTypeId } },
            () => this._createIncident(command),
        );
    }

    private async _createIncident(command: CreateIncidentCommand): Promise<Result<Incident>> {
        this.logger.log(`createIncident start — customer=${command.customerId} corner=${command.cornerId} issueType=${command.issueTypeId} slots=${command.slotIds.length}`, CTX);

        const incidentId = IncidentId(crypto.randomUUID());
        const cornerId = CornerId(command.cornerId);
        const slotIds = command.slotIds.map(id => SlotId(id));

        // 1. Obtener y validar slots
        const slotsResult = await this.slotRepository.findManyByIds(slotIds);
        if (isFail(slotsResult)) return Result.err(slotsResult.unwrapError());

        const slots = slotsResult.unwrap();

        const missingIds = slotIds.filter(id => !slots.some(s => s.id === id));
        if (missingIds.length > 0) {
            this.logger.warn(`createIncident — slots not found: ${missingIds.join(', ')}`, CTX);
            return Result.err(new Error(`Slots not found: ${missingIds.join(', ')}`));
        }

        // heldByUserId permite que slots HELD por el propio técnico (lote) pasen la validación
        const unavailable = slots.filter(s => !s.isAvailableForUser(command.heldByUserId));
        if (unavailable.length > 0) {
            this.logger.warn(`createIncident — slots unavailable: ${unavailable.map(s => s.id).join(', ')}`, CTX);
            return Result.err(new Error(`Slots not available: ${unavailable.map(s => s.id).join(', ')}`));
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
        if (!user) return Result.err(new Error(`User ${command.customerId} not found`));
        if (!user.companyId) return Result.err(new Error(`User ${command.customerId} has no company assigned`));

        /**
         * @description Valida que el usuario pertenece a una empresa.
         * @param {CompanyId} companyId - ID de la empresa.
         * @returns {Result<Company>} `Result.ok` si la operación tuvo éxito.
         * @returns {Error} Si la empresa no existe o no tiene un árbol asignado. 
         */
        const companyResult = await this.companyRepository.findById(user.companyId as CompanyId);
        if (companyResult.isFailure) return Result.err(companyResult.unwrapError());

        /**
         * @description Valida que el usuario pertenece a una empresa y que el tipo de incidencia pertenece al árbol de la empresa del usuario.
         * @param {CompanyId} companyId - ID de la empresa.
         * @returns {Result<Company>} `Result.ok` si la operación tuvo éxito.
         * @returns {Error} Si la empresa no existe.
         */
        const company = companyResult.unwrap();
        if (!company) return Result.err(new Error(`Company ${user.companyId} not found`));

        /**
         * @description Valida que el tipo de incidencia pertenece al árbol de la empresa del usuario.
         * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
         * @returns {Result<IssueType>} `Result.ok` si la operación tuvo éxito.
         * @returns {Error} Si el tipo de incidencia no existe.
         */
        const issueTypeResult = await this.issueTypeRepository.findById(command.issueTypeId);
        if (issueTypeResult.isFailure) return Result.err(issueTypeResult.unwrapError());

        /**
         * @description Valida que el tipo de incidencia pertenece al árbol de la empresa del usuario.
         * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
         * @returns {Result<IssueType>} `Result.ok` si la operación tuvo éxito.
         * @returns {Error} Si el tipo de incidencia no existe.
         */
        const issueType = issueTypeResult.unwrap();
        if (!issueType) return Result.err(new Error(`Issue type ${command.issueTypeId} not found`));

        /**
         * @description Valida que el tipo de incidencia pertenece al árbol de la empresa del usuario.
         * @param {IssueTypeId} issueTypeId - ID del tipo de incidencia.
         * @returns {Result<IssueType>} `Result.ok` si la operación tuvo éxito.
         * @returns {Error} Si el tipo de incidencia no existe.
         */
        if (issueType.treeId.toString() !== company.treeId.toString()) {
            this.logger.warn(`createIncident — issueType ${command.issueTypeId} not allowed for company ${user.companyId}`, CTX);
            return Result.err(new IssueTypeNotAllowedForCompanyError(command.issueTypeId, user.companyId.toString()));
        }

        /**
         * @description Deriva scheduledRange desde los slots (punto de verdad único).
         * @param {SlotId[]} slotIds - IDs de los slots.
         * @returns {Result<DateRange>} `Result.ok` si la operación tuvo éxito.
         * @returns {Error} Si los slots no existen.
         */
        const sorted = [...slots].sort((a, b) => a.timeRange.start.getTime() - b.timeRange.start.getTime());
        const scheduledRange = DateRange.reconstitute(sorted[0].timeRange.start, sorted[sorted.length - 1].timeRange.end);

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
            return Result.err(new Error(`El dispositivo ${command.device.serialNumber} no está registrado en el inventario`));
        }

        // Booking atómico ANTES de guardar el incident.
        // Si hay holds del técnico (lote), los convierte directamente (HELD → BOOKED).
        // Si no, toma slots AVAILABLE. Falla si otro request ya los tomó.
        const bookResult = await this.slotRepository.bookManyAtomic(slotIds, command.heldByUserId);
        if (bookResult.isFailure) return Result.err(bookResult.unwrapError());

        const booked = bookResult.unwrap();
        if (booked < slotIds.length) {
            this.logger.warn(
                `createIncident — slot conflict: expected to book ${slotIds.length}, only booked ${booked}. slotIds=${slotIds.join(', ')}`,
                CTX,
            );
            return Result.err(new Error('El horario seleccionado ya no está disponible. Por favor elegí otro horario.'));
        }

        const incidentResult = Incident.create(
            incidentId,
            command.issueTypeId as IssueTypeId,
            command.customerId as CustomerId,
            cornerId,
            slotIds,
            scheduledRange,
            command.origin as IncidentOrigin,
            command.metadata || {}
        );

        if (incidentResult.isFailure) return incidentResult;
        const incident = incidentResult.unwrap();
        incident.attachDevice(device.id.toString());

        const events = incident.pullEvents();

        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) {
            this.logger.error(`createIncident — save failed: ${saveResult.unwrapError().message}`, saveResult.unwrapError().stack ?? '', CTX);
            return Result.err(saveResult.unwrapError());
        }

        /**
         * @description Persiste el timeline y publica al Outbox.
         * @param {IncidentId} incidentId - ID de la incidencia.
         * @param {DomainEvent[]} events - Eventos de la incidencia.
         * @returns {Result<void>} `Result.ok` si la operación tuvo éxito.
         * @returns {Error} Si el timeline no se pudo persistir o los eventos no se pudieron publicar.
         */
        await this.incidentRepository.saveEvents(incident.id as any, events);
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

        this.logger.log(`createIncident success — id=${incident.id} origin=${incident.origin} slots=${slots.length} scheduled=${scheduledRange.start.toISOString()}`, CTX);
        return Result.ok(incident);
    }

    async deliverIncident(command: DeliverIncidentCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.deliverIncident',
            { kind: 'server', attributes: { 'incident.incidentId': command.incidentId, 'incident.technicianId': command.technicianId } },
            () => this._deliverIncident(command),
        );
    }

    private async _deliverIncident(command: DeliverIncidentCommand): Promise<Result<Incident>> {
        const incidentResult = await this.incidentRepository.findById(command.incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());

        const incident = incidentResult.unwrap();
        if (!incident) {
            return Result.err(new Error(`Incident ${command.incidentId} not found`));
        }

        const deliverResult = incident.deliver(command.technicianId as TechnicianId);
        if (deliverResult.isFailure) return Result.err(deliverResult.unwrapError());

        const deliverEvents = incident.pullEvents();
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        await this.incidentRepository.saveEvents(incident.id as any, deliverEvents);
        await this.eventBus.publishMany(deliverEvents);

        const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
        await this.cache.deletePattern(`availability:${incident.cornerId}:${dateStr}:*`);

        return Result.ok(incident);
    }

    async takeIncident(command: TakeIncidentCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.takeIncident',
            { kind: 'server', attributes: { 'incident.incidentId': command.incidentId, 'incident.technicianId': command.technicianId } },
            () => this._takeIncident(command),
        );
    }

    private async _takeIncident(command: TakeIncidentCommand): Promise<Result<Incident>> {
        // 1. Obtener incidencia
        const incidentResult = await this.incidentRepository.findById(command.incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());

        const incident = incidentResult.unwrap();
        if (!incident) {
            return Result.err(new Error(`Incident ${command.incidentId} not found`));
        }

        // 2. Validar técnico
        const technicianId = command.technicianId as TechnicianId;

        // 3. Tomar incidencia
        const takeResult = incident.take(technicianId);
        if (takeResult.isFailure) return Result.err(takeResult.unwrapError());

        // 4. Extraer eventos antes de guardar
        const takeEvents = incident.pullEvents();

        // 5. Guardar cambios
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        // 6. Persistir timeline y publicar al Outbox
        await this.incidentRepository.saveEvents(incident.id as any, takeEvents);
        await this.eventBus.publishMany(takeEvents);

        // 6. Invalidar caché
        const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
        await this.cache.deletePattern(`availability:${incident.cornerId}:${dateStr}:*`);

        return Result.ok(incident);
    }

    async releaseIncident(command: ReleaseIncidentCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.releaseIncident',
            { kind: 'server', attributes: { 'incident.incidentId': command.incidentId, 'incident.technicianId': command.technicianId } },
            () => this._releaseIncident(command),
        );
    }

    private async _releaseIncident(command: ReleaseIncidentCommand): Promise<Result<Incident>> {
        // Similar a takeIncident
        const incidentResult = await this.incidentRepository.findById(command.incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());

        const incident = incidentResult.unwrap();
        if (!incident) {
            return Result.err(new Error(`Incident ${command.incidentId} not found`));
        }

        const technicianId = command.technicianId as TechnicianId;
        const releaseResult = incident.release(technicianId, command.reason);
        if (releaseResult.isFailure) return Result.err(releaseResult.unwrapError());

        const releaseEvents = incident.pullEvents();
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        await this.incidentRepository.saveEvents(incident.id as any, releaseEvents);
        await this.eventBus.publishMany(releaseEvents);

        const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
        await this.cache.deletePattern(`availability:${incident.cornerId}:${dateStr}:*`);

        return Result.ok(incident);
    }

    async changeStatus(command: ChangeIncidentStatusCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.changeStatus',
            { kind: 'server', attributes: { 'incident.incidentId': command.incidentId, 'incident.newStatus': command.newStatus } },
            () => this._changeStatus(command),
        );
    }

    private async _changeStatus(command: ChangeIncidentStatusCommand): Promise<Result<Incident>> {
        const incidentResult = await this.incidentRepository.findById(command.incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());

        const incident = incidentResult.unwrap();
        if (!incident) {
            return Result.err(new Error(`Incident ${command.incidentId} not found`));
        }

        const prevStatus = incident.status;
        const technicianId = command.technicianId as TechnicianId;
        const changeResult = incident.changeStatus(command.newStatus, technicianId, command.comment, command.closeCategory);
        if (changeResult.isFailure) {
            this.logger.warn(`changeStatus — transition rejected id=${command.incidentId} ${prevStatus}→${command.newStatus}: ${changeResult.unwrapError().message}`, CTX);
            return Result.err(changeResult.unwrapError());
        }

        const statusEvents = incident.pullEvents();
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        // Si se cancela, los slots pasan a EXPIRED (consumidos, no reutilizables)
        if (command.newStatus === IncidentStatus.CANCELED) {
            const slotsResult = await this.slotRepository.findManyByIds(incident.slotIds);
            if (slotsResult.isFailure) return Result.err(slotsResult.unwrapError());
            const slots = slotsResult.unwrap();
            for (const s of slots) {
                s.expire();
            }
            const slotsUpdateResult = await this.slotRepository.updateMany(slots);
            if (slotsUpdateResult.isFailure) return Result.err(slotsUpdateResult.unwrapError());
        }

        await this.incidentRepository.saveEvents(incident.id as any, statusEvents);
        await this.eventBus.publishMany(statusEvents);

        const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
        await this.cache.deletePattern(`availability:${incident.cornerId}:${dateStr}:*`);

        this.logger.log(`changeStatus — id=${incident.id} ${prevStatus}→${incident.status}`, CTX);
        return Result.ok(incident);
    }

    async validateIncident(command: ValidateIncidentCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.validateIncident',
            { kind: 'server', attributes: { 'incident.incidentId': command.incidentId } },
            () => this._validateIncident(command),
        );
    }

    private async _validateIncident(command: ValidateIncidentCommand): Promise<Result<Incident>> {
        const incidentResult = await this.incidentRepository.findById(command.incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());
        const incident = incidentResult.unwrap();
        if (!incident) return Result.err(new Error(`Incident ${command.incidentId} not found`));

        const result = incident.validate();
        if (result.isFailure) return Result.err(result.unwrapError());

        const validateEvents = incident.pullEvents();
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        await this.incidentRepository.saveEvents(incident.id as any, validateEvents);
        await this.eventBus.publishMany(validateEvents);
        return Result.ok(incident);
    }

    async reopenIncident(command: ReopenIncidentCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.reopenIncident',
            { kind: 'server', attributes: { 'incident.incidentId': command.incidentId } },
            () => this._reopenIncident(command),
        );
    }

    private async _reopenIncident(command: ReopenIncidentCommand): Promise<Result<Incident>> {
        const incidentResult = await this.incidentRepository.findById(command.incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());
        const incident = incidentResult.unwrap();
        if (!incident) return Result.err(new Error(`Incident ${command.incidentId} not found`));

        const result = incident.reopen(command.reason);
        if (result.isFailure) return Result.err(result.unwrapError());

        const reopenEvents = incident.pullEvents();
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        await this.incidentRepository.saveEvents(incident.id as any, reopenEvents);
        await this.eventBus.publishMany(reopenEvents);
        const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
        await this.cache.deletePattern(`availability:${incident.cornerId}:${dateStr}:*`);
        return Result.ok(incident);
    }

    async cancelIncident(command: CancelIncidentCommand): Promise<Result<Incident>> {
        return this.tracing.run(
            'monolith.cancelIncident',
            { kind: 'server', attributes: { 'incident.incidentId': command.incidentId, 'incident.customerId': command.customerId } },
            () => this._cancelIncident(command),
        );
    }

    private async _cancelIncident(command: CancelIncidentCommand): Promise<Result<Incident>> {
        const incidentResult = await this.incidentRepository.findById(command.incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());
        const incident = incidentResult.unwrap();
        if (!incident) return Result.err(new Error(`Incident ${command.incidentId} not found`));

        if (incident.status !== IncidentStatus.CREATED) {
            return Result.err(new Error(`Solo se pueden cancelar incidencias en estado CREATED. Estado actual: ${incident.status}`));
        }

        // Use changeStatus — technicianId is stored in the event but not validated for CANCELED
        const result = incident.changeStatus(IncidentStatus.CANCELED, null as any, command.reason);
        if (result.isFailure) return Result.err(result.unwrapError());

        const events = incident.pullEvents();
        const saveResult = await this.incidentRepository.save(incident);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        // Release future slots back to AVAILABLE; expire past ones
        const slotsResult = await this.slotRepository.findManyByIds(incident.slotIds);
        if (!slotsResult.isFailure) {
            const slots = slotsResult.unwrap();
            const now = new Date();
            for (const s of slots) {
                if (s.timeRange.start > now) {
                    s.release(); // Future slot → AVAILABLE (re-bookable)
                } else {
                    s.expire();  // Past slot → EXPIRED
                }
            }
            await this.slotRepository.updateMany(slots);
        }

        await this.incidentRepository.saveEvents(incident.id as any, events);
        await this.eventBus.publishMany(events);
        const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
        await this.cache.deletePattern(`availability:${incident.cornerId}:${dateStr}:*`);

        this.logger.log(`cancelIncident — id=${incident.id} by customer=${command.customerId}`, CTX);
        return Result.ok(incident);
    }

    async getIncident(id: IncidentId): Promise<Result<Incident | null>> {
        return this.incidentRepository.findById(id);
    }

    async getAvailableIncidents(cornerId: CornerId): Promise<Result<Incident[]>> {
        return this.incidentRepository.findAvailable(cornerId);
    }

    async getTechnicianIncidents(technicianId: TechnicianId): Promise<Result<Incident[]>> {
        return this.incidentRepository.findByTechnician(technicianId);
    }

    async getIncidentsByDate(cornerId: CornerId, date: Date): Promise<Result<Incident[]>> {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        return this.incidentRepository.findByDateRange(cornerId, start, end);
    }

    async batchChangeStatus(items: BatchStatusChangeItem[]): Promise<Result<BatchChangeResult>> {
        const result: BatchChangeResult = { processed: 0, skipped: 0, failed: 0, errors: [] };

        // Reject duplicate incidentIds within the same batch
        const seen = new Set<string>();
        for (const item of items) {
            if (seen.has(item.incidentId)) {
                result.failed++;
                result.errors.push({ incidentId: item.incidentId, reason: 'Duplicate incidentId in batch' });
                continue;
            }
            seen.add(item.incidentId);

            try {
                const incidentResult = await this.incidentRepository.findById(IncidentId(item.incidentId));
                if (incidentResult.isFailure) {
                    result.failed++;
                    result.errors.push({ incidentId: item.incidentId, reason: incidentResult.unwrapError().message });
                    continue;
                }

                const incident = incidentResult.unwrap();
                if (!incident) {
                    result.failed++;
                    result.errors.push({ incidentId: item.incidentId, reason: 'Incident not found' });
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
                    result.errors.push({ incidentId: item.incidentId, reason: changeResult.unwrapError().message });
                    continue;
                }

                const batchEvents = incident.pullEvents();
                const saveResult = await this.incidentRepository.save(incident);
                if (saveResult.isFailure) {
                    result.failed++;
                    result.errors.push({ incidentId: item.incidentId, reason: saveResult.unwrapError().message });
                    continue;
                }

                await this.incidentRepository.saveEvents(incident.id as any, batchEvents);
                await this.eventBus.publishMany(batchEvents);

                const dateStr = incident.scheduledRange.start.toISOString().split('T')[0];
                await this.cache.deletePattern(`availability:${incident.cornerId}:${dateStr}:*`);

                result.processed++;
            } catch (error: any) {
                result.failed++;
                result.errors.push({ incidentId: item.incidentId, reason: error?.message ?? String(error) });
            }
        }

        return Result.ok(result);
    }

}