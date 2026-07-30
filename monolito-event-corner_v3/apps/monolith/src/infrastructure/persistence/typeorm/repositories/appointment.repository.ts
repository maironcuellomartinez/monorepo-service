// infrastructure/persistence/typeorm/repositories/appointment.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, IsNull } from 'typeorm';
import {
  IAppointmentRepository,
  AppointmentFilters,
  AppointmentTimelineEntry,
  PaginatedResult,
} from '../../../../core/ports/outgoing/repositories/appointment-repository.port';
import { AppointmentEntity } from '../entities/appointment.entity';
import { AppointmentSlotEntity } from '../entities/appointment-slot.entity';
import { AppointmentTimelineEntity } from '../entities/appointment-timeline.entity';
import { Appointment } from '../../../../core/domain/entities/appointment.entity';
import { DateRange } from '../../../../core/domain/value-objects/date-range.value';
import {
  AppointmentStatus,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
} from '../../../../core/domain/enums/appointment-status.enum';
import { AppointmentKind } from '../../../../core/domain/enums/appointment-kind.enum';
import { AppointmentOrigin } from '../../../../core/domain/enums/appointment-origin.enum';
import { Result } from '@app/result';
import {
  AppointmentId,
  CompanyId,
  CornerId,
  CustomerId,
  IssueTypeId,
  LockerId,
  SlotId,
  TechnicianId,
} from '@app/shared/types/branded-ids';

@Injectable()
export class TypeOrmAppointmentRepository implements IAppointmentRepository {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    @InjectRepository(AppointmentSlotEntity)
    private readonly appointmentSlotRepository: Repository<AppointmentSlotEntity>,
    @InjectRepository(AppointmentTimelineEntity)
    private readonly timelineRepository: Repository<AppointmentTimelineEntity>,
  ) {}

  async save(appointment: Appointment): Promise<Result<void>> {
    try {
      const entity = this.toEntity(appointment);
      // issue_id no es AUTO_INCREMENT (ver comentario en AppointmentEntity) —
      // se asigna acá vía la tabla issue_sequences (contador 'appointment')
      // la primera vez que se persiste el agregado; en saves posteriores ya
      // viene poblado desde el reload (findById) que precede a cada update.
      entity.issue_id = appointment.issueId ?? (await this.allocateIssueId());
      await this.appointmentRepository.save(entity);

      // Reemplazar slots asociados
      await this.appointmentSlotRepository.delete({
        appointment_id: appointment.id.toString(),
      });

      const slotRelations = appointment.slotIds.map((slotId) => {
        const relation = new AppointmentSlotEntity();
        relation.appointment_id = appointment.id.toString();
        relation.slot_id = slotId.toString();
        relation.created_at = new Date();
        return relation;
      });

      if (slotRelations.length > 0) {
        await this.appointmentSlotRepository.save(slotRelations);
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findById(id: AppointmentId | string): Promise<Result<Appointment | null>> {
    try {
      const entity = await this.appointmentRepository.findOne({
        where: { appointment_id: id.toString() },
        relations: [
          'issueType',
          'customer',
          'company',
          'corner',
          'currentTechnician',
          'device',
          'locker',
        ],
      });

      if (!entity) return Result.ok(null);

      const slotIds = await this.getSlotIds(entity.appointment_id);
      return Result.ok(this.toDomain(entity, slotIds));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByStatus(
    cornerId: CornerId | string,
    statuses: AppointmentStatus[],
  ): Promise<Result<Appointment[]>> {
    try {
      const entities = await this.appointmentRepository.find({
        where: { corner_id: cornerId.toString(), status: In(statuses) },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });
      return Result.ok(await this.toDomainMany(entities));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByTechnician(technicianId: TechnicianId | string): Promise<Result<Appointment[]>> {
    try {
      const entities = await this.appointmentRepository.find({
        where: { current_technician_id: technicianId.toString() },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });
      return Result.ok(await this.toDomainMany(entities));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findAvailable(cornerId: CornerId | string): Promise<Result<Appointment[]>> {
    try {
      const entities = await this.appointmentRepository.find({
        where: {
          corner_id: cornerId.toString(),
          status: AppointmentStatus.CREATED,
          current_technician_id: IsNull(),
        },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });
      return Result.ok(await this.toDomainMany(entities));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByCustomer(customerId: CustomerId | string): Promise<Result<Appointment[]>> {
    try {
      const entities = await this.appointmentRepository.find({
        where: { customer_id: customerId.toString() },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'DESC' },
      });
      return Result.ok(await this.toDomainMany(entities));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByDateRange(
    cornerId: CornerId | string,
    start: Date,
    end: Date,
  ): Promise<Result<Appointment[]>> {
    try {
      const entities = await this.appointmentRepository.find({
        where: {
          corner_id: cornerId.toString(),
          scheduled_start: Between(start, end),
        },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });
      return Result.ok(await this.toDomainMany(entities));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findWithFilters(
    filters: AppointmentFilters,
  ): Promise<Result<PaginatedResult<Appointment>>> {
    try {
      const page = filters.page ?? 1;
      const limit = Math.min(filters.limit ?? 20, 100);
      const skip = (page - 1) * limit;

      const queryBuilder = this.appointmentRepository
        .createQueryBuilder('appointment')
        .leftJoinAndSelect('appointment.issueType', 'issueType')
        .leftJoinAndSelect('appointment.customer', 'customer')
        .leftJoinAndSelect('appointment.corner', 'corner')
        .leftJoinAndSelect('appointment.currentTechnician', 'currentTechnician')
        .leftJoinAndSelect('appointment.device', 'device');

      if (filters.servicenowNumber) {
        queryBuilder
          .leftJoin('servicenow_ticket_links', 'link', 'link.appointment_id = appointment.appointment_id')
          .andWhere('link.number LIKE :snNumber', { snNumber: `%${filters.servicenowNumber}%` });
      }

      if (filters.cornerId) {
        queryBuilder.andWhere('appointment.corner_id = :cornerId', { cornerId: filters.cornerId });
      }
      if (filters.customerId) {
        queryBuilder.andWhere('appointment.customer_id = :customerId', { customerId: filters.customerId });
      }
      if (filters.companyId) {
        queryBuilder.andWhere('appointment.company_id = :companyId', { companyId: filters.companyId });
      }
      if (filters.kind) {
        queryBuilder.andWhere('appointment.kind = :kind', { kind: filters.kind });
      }
      if (filters.technicianId) {
        queryBuilder.andWhere('appointment.current_technician_id = :technicianId', {
          technicianId: filters.technicianId,
        });
      } else if (filters.availableOnly) {
        // Ocultar solo citas activas tomadas por un técnico.
        // Las terminales (CLOSED, VALIDATED, CANCELED) siempre son buscables.
        const terminalStatuses = TERMINAL_STATUSES.concat([AppointmentStatus.CLOSED] as any);
        queryBuilder.andWhere(
          '(appointment.current_technician_id IS NULL OR appointment.status IN (:...terminalStatuses))',
          { terminalStatuses },
        );
      }
      if (filters.status && filters.status.length > 0) {
        queryBuilder.andWhere('appointment.status IN (:...status)', { status: filters.status });
      }
      if (filters.issueTypeId) {
        queryBuilder.andWhere('appointment.issue_type_id = :issueTypeId', { issueTypeId: filters.issueTypeId });
      }
      if (filters.customerEmail) {
        queryBuilder.andWhere('customer.email LIKE :customerEmail', {
          customerEmail: `%${filters.customerEmail}%`,
        });
      }
      if (filters.deviceSerial) {
        queryBuilder.andWhere('device.serial_number LIKE :deviceSerial', {
          deviceSerial: `%${filters.deviceSerial}%`,
        });
      }
      if (filters.fromDate) {
        queryBuilder.andWhere('appointment.scheduled_start >= :fromDate', { fromDate: filters.fromDate });
      }
      if (filters.toDate) {
        queryBuilder.andWhere('appointment.scheduled_start <= :toDate', { toDate: filters.toDate });
      }

      queryBuilder.orderBy('appointment.scheduled_start', 'DESC').skip(skip).take(limit);

      const [entities, total] = await queryBuilder.getManyAndCount();
      const data = await this.toDomainMany(entities);

      return Result.ok({ data, total, page, limit });
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByServiceNowNumber(number: string): Promise<Result<Appointment | null>> {
    try {
      const link = await this.appointmentRepository.manager
        .createQueryBuilder()
        .select('link.appointment_id', 'appointmentId')
        .from('servicenow_ticket_links', 'link')
        .where('link.number = :number', { number })
        .getRawOne<{ appointmentId: string }>();

      if (!link) return Result.ok(null);

      return this.findById(link.appointmentId);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findBySlotId(slotId: SlotId | string): Promise<Result<Appointment | null>> {
    try {
      const slotRelation = await this.appointmentSlotRepository.findOne({
        where: { slot_id: slotId.toString() },
      });
      if (!slotRelation) return Result.ok(null);
      return this.findById(slotRelation.appointment_id);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findActiveAppointmentSlotIds(
    slotIds: SlotId[],
    excludeAppointmentId: AppointmentId,
  ): Promise<Result<Set<string>>> {
    try {
      if (slotIds.length === 0) return Result.ok(new Set());

      const relations = await this.appointmentSlotRepository.find({
        where: { slot_id: In(slotIds.map((s) => s.toString())) },
      });
      const otherAppointmentIds = [
        ...new Set(
          relations
            .map((r) => r.appointment_id)
            .filter((id) => id !== excludeAppointmentId.toString()),
        ),
      ];
      if (otherAppointmentIds.length === 0) return Result.ok(new Set());

      const activeAppointments = await this.appointmentRepository.find({
        where: { appointment_id: In(otherAppointmentIds), status: In(ACTIVE_STATUSES) },
        select: ['appointment_id'],
      });
      const activeIds = new Set(activeAppointments.map((a) => a.appointment_id));

      const stillActiveSlotIds = new Set(
        relations
          .filter((r) => r.appointment_id !== excludeAppointmentId.toString() && activeIds.has(r.appointment_id))
          .map((r) => r.slot_id),
      );
      return Result.ok(stillActiveSlotIds);
    } catch (error) {
      return Result.err(error);
    }
  }

  async update(appointment: Appointment): Promise<Result<void>> {
    return this.save(appointment);
  }

  async findActiveByDeviceId(deviceId: string): Promise<Result<Appointment[]>> {
    try {
      const entities = await this.appointmentRepository.find({
        where: { device_id: deviceId, status: In(ACTIVE_STATUSES) },
      });
      return Result.ok(await this.toDomainMany(entities));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findActiveCustomerIds(): Promise<
    Result<{ customerId: string; externalId: string | null }[]>
  > {
    try {
      const rows = await this.appointmentRepository
        .createQueryBuilder('a')
        .select('a.customer_id', 'customerId')
        .addSelect('MAX(u.external_id)', 'externalId')
        .leftJoin('users', 'u', 'u.customer_id = a.customer_id')
        .where('a.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
        .andWhere('a.customer_id IS NOT NULL')
        .groupBy('a.customer_id')
        .getRawMany<{ customerId: string; externalId: string | null }>();
      return Result.ok(rows);
    } catch (error) {
      return Result.err(error);
    }
  }

  /**
   * Citas no terminales, creadas hace más de `minAgeMinutes`, sin ningún
   * ServiceNowTicketLink activo (ni PENDING/ACTIVE) — generaliza
   * findOrphanedSnowIncidents (antes Incident-only) a cualquier kind.
   */
  async findOrphanedTicketAppointments(minAgeMinutes: number): Promise<Result<Appointment[]>> {
    try {
      const terminalStatuses = [
        AppointmentStatus.CLOSED,
        AppointmentStatus.VALIDATED,
        AppointmentStatus.CANCELED,
      ];
      const cutoff = new Date(Date.now() - minAgeMinutes * 60_000);

      const entities = await this.appointmentRepository
        .createQueryBuilder('appointment')
        .leftJoinAndSelect('appointment.customer', 'customer')
        .where('appointment.status NOT IN (:...terminalStatuses)', { terminalStatuses })
        .andWhere('appointment.created_at <= :cutoff', { cutoff })
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM servicenow_ticket_links link
            WHERE link.appointment_id = appointment.appointment_id
              AND link.status IN ('PENDING', 'ACTIVE')
          )`,
        )
        .orderBy('appointment.created_at', 'ASC')
        .take(20)
        .getMany();

      return Result.ok(await this.toDomainMany(entities));
    } catch (error) {
      return Result.err(error);
    }
  }

  async saveEvents(appointmentId: AppointmentId | string, events: any[]): Promise<Result<void>> {
    try {
      for (const event of events) {
        const timelineEntity = new AppointmentTimelineEntity();
        timelineEntity.appointment_id = appointmentId.toString();
        timelineEntity.action_type = event.type;
        timelineEntity.from_status = event.data?.oldStatus;
        timelineEntity.to_status = event.data?.newStatus;
        timelineEntity.technician_id = event.data?.technicianId?.toString();
        timelineEntity.comment = event.data?.comment || event.data?.reason;
        timelineEntity.worked_from = event.data?.workedFrom;
        timelineEntity.worked_until = event.data?.workedUntil;
        timelineEntity.created_at = event.timestamp || new Date();

        await this.timelineRepository.save(timelineEntity);
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async getTimeline(appointmentId: AppointmentId | string): Promise<Result<AppointmentTimelineEntry[]>> {
    try {
      const entries = await this.timelineRepository.find({
        where: { appointment_id: appointmentId.toString() },
        relations: ['technician'],
        order: { created_at: 'ASC' },
      });
      const mapped: AppointmentTimelineEntry[] = entries.map((e) => ({
        activityId: e.activity_id,
        appointmentId: e.appointment_id,
        technicianId: e.technician_id ?? null,
        technicianName: e.technician
          ? [e.technician.name, e.technician.last_name].filter(Boolean).join(' ')
          : null,
        actionType: e.action_type,
        fromStatus: e.from_status ?? null,
        toStatus: e.to_status ?? null,
        comment: e.comment ?? null,
        createdAt: e.created_at,
      }));
      return Result.ok(mapped);
    } catch (error) {
      return Result.err(error);
    }
  }

  async addNote(
    appointmentId: AppointmentId | string,
    technicianId: TechnicianId | null,
    comment: string,
  ): Promise<Result<void>> {
    try {
      const appointment = await this.appointmentRepository.findOne({
        where: { appointment_id: appointmentId.toString() },
        select: ['status'],
      });

      const entry = new AppointmentTimelineEntity();
      entry.appointment_id = appointmentId.toString();
      entry.technician_id = technicianId as unknown as string;
      entry.action_type = 'NOTE_ADDED';
      entry.comment = comment;
      entry.to_status = appointment?.status as string;
      entry.created_at = new Date();
      await this.timelineRepository.save(entry);
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  /**
   * Asigna el próximo valor de la secuencia `issue_sequences` (fila
   * 'appointment') de forma atómica — ver el comentario análogo en
   * TypeOrmIncidentRepository.allocateIssueId(). Contador propio, sembrado
   * por encima del máximo de incidents/requests en el backfill (Fase 2) para
   * no colisionar con issue_id históricos.
   */
  private async allocateIssueId(): Promise<number> {
    return this.appointmentRepository.manager.transaction(async (txEm) => {
      await txEm.query(
        `UPDATE issue_sequences SET next_value = LAST_INSERT_ID(next_value + 1) WHERE entity_name = 'appointment'`,
      );
      const rows = await txEm.query(`SELECT LAST_INSERT_ID() AS id`);
      return Number(rows[0].id);
    });
  }

  private async getSlotIds(appointmentId: string): Promise<string[]> {
    const slotRelations = await this.appointmentSlotRepository.find({
      where: { appointment_id: appointmentId },
    });
    return slotRelations.map((r) => r.slot_id);
  }

  private async toDomainMany(entities: AppointmentEntity[]): Promise<Appointment[]> {
    return Promise.all(
      entities.map(async (e) => this.toDomain(e, await this.getSlotIds(e.appointment_id))),
    );
  }

  private toEntity(domain: Appointment): AppointmentEntity {
    const entity = new AppointmentEntity();
    entity.appointment_id = domain.id.toString();
    entity.kind = domain.kind;
    entity.issue_type_id = domain.issueTypeId.toString();
    entity.customer_id = domain.customerId.toString();
    entity.company_id = domain.companyId.toString();
    entity.corner_id = domain.cornerId.toString();
    entity.device_id = domain.deviceId?.toString() || null;
    entity.locker_id = domain.lockerId?.toString() || null;
    entity.current_technician_id = domain.currentTechnicianId?.toString() || null;
    entity.created_by_technician_id = domain.createdByTechnicianId?.toString() || null;
    entity.status = domain.status;
    entity.priority = domain.priority;
    entity.origin_channel = domain.origin;
    entity.scheduled_start = domain.scheduledRange.start;
    entity.scheduled_end = domain.scheduledRange.end;
    entity.duration_minutes = domain.durationMinutes;
    entity.metadata = domain.metadata;
    entity.closed_at = domain.closedAt;
    entity.estimated_close_at = domain.estimatedCloseAt;
    entity.comment = domain.comment;
    entity.created_at = domain.createdAt;
    entity.updated_at = domain.updatedAt;
    return entity;
  }

  private toDomain(entity: AppointmentEntity, slotIds: string[]): Appointment {
    const scheduledRange = DateRange.reconstitute(entity.scheduled_start, entity.scheduled_end);
    const slotIdObjects = slotIds.map((id) => SlotId(id as any));

    const appointment = Appointment.reconstitute(
      AppointmentId(entity.appointment_id),
      IssueTypeId(entity.issue_type_id),
      entity.kind as AppointmentKind,
      CustomerId(entity.customer_id),
      CompanyId(entity.company_id),
      CornerId(entity.corner_id),
      slotIdObjects,
      scheduledRange,
      entity.duration_minutes,
      entity.status as AppointmentStatus,
      entity.origin_channel as AppointmentOrigin,
      entity.priority,
      entity.current_technician_id ? TechnicianId(entity.current_technician_id) : null,
      entity.created_by_technician_id ? TechnicianId(entity.created_by_technician_id) : null,
      entity.device_id || null,
      entity.locker_id ? LockerId(entity.locker_id) : null,
      entity.metadata || {},
      entity.closed_at || null,
      entity.comment || null,
      entity.created_at,
      entity.updated_at,
      entity.issue_id ?? null,
      entity.estimated_close_at || null,
    );

    if (entity.device) {
      appointment.setDeviceInfo({
        serialNumber: entity.device.serial_number,
        model: entity.device.model ?? null,
        brand: entity.device.brand ?? null,
      });
    }
    if (entity.customer) {
      appointment.setCustomerInfo({
        id: entity.customer.customer_id,
        email: entity.customer.email ?? null,
        name: entity.customer.name ?? null,
      });
    }
    if (entity.corner) {
      appointment.setCornerInfo({ id: entity.corner.corner_id, name: entity.corner.name });
    }
    if (entity.issueType) {
      appointment.setIssueTypeInfo({
        id: entity.issueType.issue_type_id,
        name: entity.issueType.name,
        category: entity.issueType.category,
      });
    }
    if (entity.currentTechnician) {
      appointment.setTechnicianInfo({
        id: entity.currentTechnician.technician_id,
        name:
          entity.currentTechnician.full_name ||
          `${entity.currentTechnician.name}${entity.currentTechnician.last_name ? ' ' + entity.currentTechnician.last_name : ''}`,
      });
    }

    return appointment;
  }
}
