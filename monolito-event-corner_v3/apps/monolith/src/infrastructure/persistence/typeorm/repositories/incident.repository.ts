import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, IsNull, Not } from 'typeorm';
import {
  IIncidentRepository,
  IncidentFilters,
  IncidentTimelineEntry,
  PaginatedResult,
} from '../../../../core/ports/outgoing/repositories/incident-repository.port';
import { IncidentEntity } from '../entities/incident.entity';
import { IncidentSlotEntity } from '../entities/incident-slot.entity';
import { IncidentTimelineEntity } from '../entities/incident-timeline.entity';
import { Incident } from '../../../../core/domain/entities/incident.entity';
import { DateRange } from '../../../../core/domain/value-objects/date-range.value';
import { IncidentStatus } from '../../../../core/domain/enums/incident-status.enum';
import { IncidentOrigin } from '../../../../core/domain/enums/incident-origin.enum';
import { ServiceNowId } from '../../../../core/domain/value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../../../../core/domain/value-objects/servicenow-number.value';
import { Result } from '@app/result';
import {
  CornerId,
  CustomerId,
  IncidentId,
  IssueTypeId,
  LockerId,
  SlotId,
  TechnicianId,
} from '@app/shared/types/branded-ids';

@Injectable()
export class TypeOrmIncidentRepository implements IIncidentRepository {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidentRepository: Repository<IncidentEntity>,
    @InjectRepository(IncidentSlotEntity)
    private readonly incidentSlotRepository: Repository<IncidentSlotEntity>,
    @InjectRepository(IncidentTimelineEntity)
    private readonly timelineRepository: Repository<IncidentTimelineEntity>,
  ) {}

  /**
   * Guarda un incidente en la base de datos.
   * @example
   * ```typescript
   * const incident = Incident.create({
   *     id: IncidentId.create('incident-1'),
   *     cornerId: CornerId.create('corner-1'),
   *     customerId: CustomerId.create('customer-1'),
   *     deviceIds: [DeviceId.create('device-1'), DeviceId.create('device-2')],
   *     issueTypeId: IssueTypeId.create('issue-type-1'),
   *     lockerId: LockerId.create('locker-1'),
   *     scheduledStart: new Date(),
   *     scheduledEnd: new Date(),
   *     status: IncidentStatus.Open,
   *     origin: IncidentOrigin.User,
   *     createdAt: new Date(),
   * });
   * const result = await this.incidentRepository.save(incident);
   * ```
   * @param incident El incidente a guardar.
   * @returns Un resultado que indica si la operación fue exitosa.
   */
  async save(incident: Incident): Promise<Result<void>> {
    try {
      const entity = this.toEntity(incident);
      await this.incidentRepository.save(entity);

      // Guardar slots asociados
      await this.incidentSlotRepository.delete({
        incident_id: incident.id.toString(),
      });

      const slotRelations = incident.slotIds.map((slotId) => {
        const relation = new IncidentSlotEntity();
        relation.incident_id = incident.id.toString();
        relation.slot_id = slotId.toString();
        relation.created_at = new Date();
        return relation;
      });

      if (slotRelations.length > 0) {
        await this.incidentSlotRepository.save(slotRelations);
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findById(id: IncidentId | string): Promise<Result<Incident | null>> {
    try {
      const entity = await this.incidentRepository.findOne({
        where: { incident_id: id.toString() },
        relations: [
          'issueType',
          'customer',
          'corner',
          'currentTechnician',
          'device',
          'locker',
        ],
      });

      if (!entity) return Result.ok(null);

      // Obtener slots asociados
      const slotRelations = await this.incidentSlotRepository.find({
        where: { incident_id: id.toString() },
      });

      const slotIds = slotRelations.map((r) => r.slot_id);

      const domain = await this.toDomain(entity, slotIds);
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByStatus(
    cornerId: string,
    statuses: IncidentStatus[],
  ): Promise<Result<Incident[]>> {
    try {
      const entities = await this.incidentRepository.find({
        where: {
          corner_id: cornerId,
          status: In(statuses),
        },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });

      const domains = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          const slotIds = slotRelations.map((r) => r.slot_id);
          return this.toDomain(e, slotIds);
        }),
      );

      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByTechnician(technicianId: string): Promise<Result<Incident[]>> {
    try {
      const entities = await this.incidentRepository.find({
        where: { current_technician_id: technicianId },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });

      const domains = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          const slotIds = slotRelations.map((r) => r.slot_id);
          return this.toDomain(e, slotIds);
        }),
      );

      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findAvailable(cornerId: string): Promise<Result<Incident[]>> {
    try {
      const entities = await this.incidentRepository.find({
        where: {
          corner_id: cornerId,
          status: IncidentStatus.CREATED,
          current_technician_id: IsNull(),
        },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });

      const domains = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          const slotIds = slotRelations.map((r) => r.slot_id);
          return this.toDomain(e, slotIds);
        }),
      );

      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByCustomer(customerId: string): Promise<Result<Incident[]>> {
    try {
      const entities = await this.incidentRepository.find({
        where: { customer_id: customerId },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'DESC' },
      });

      const domains = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          const slotIds = slotRelations.map((r) => r.slot_id);
          return this.toDomain(e, slotIds);
        }),
      );

      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByDateRange(
    cornerId: string,
    start: Date,
    end: Date,
  ): Promise<Result<Incident[]>> {
    try {
      const entities = await this.incidentRepository.find({
        where: {
          corner_id: cornerId,
          scheduled_start: Between(start, end),
        },
        relations: ['issueType', 'customer', 'corner', 'currentTechnician'],
        order: { scheduled_start: 'ASC' },
      });

      const domains = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          const slotIds = slotRelations.map((r) => r.slot_id);
          return this.toDomain(e, slotIds);
        }),
      );

      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findWithFilters(
    filters: IncidentFilters,
  ): Promise<Result<PaginatedResult<Incident>>> {
    try {
      const page = filters.page ?? 1;
      const limit = Math.min(filters.limit ?? 20, 100);
      const skip = (page - 1) * limit;

      const queryBuilder = this.incidentRepository
        .createQueryBuilder('incident')
        .leftJoinAndSelect('incident.issueType', 'issueType')
        .leftJoinAndSelect('incident.customer', 'customer')
        .leftJoinAndSelect('incident.corner', 'corner')
        .leftJoinAndSelect('incident.currentTechnician', 'currentTechnician')
        .leftJoinAndSelect('incident.device', 'device');

      if (filters.cornerId) {
        queryBuilder.andWhere('incident.corner_id = :cornerId', {
          cornerId: filters.cornerId,
        });
      }

      if (filters.customerId) {
        queryBuilder.andWhere('incident.customer_id = :customerId', {
          customerId: filters.customerId,
        });
      }

      if (filters.technicianId) {
        queryBuilder.andWhere(
          'incident.current_technician_id = :technicianId',
          { technicianId: filters.technicianId },
        );
      } else if (filters.availableOnly) {
        // Ocultar solo incidencias activas tomadas por un técnico.
        // Las terminales (CLOSED, VALIDATED, CANCELED) siempre son buscables.
        const terminalStatuses = ['CLOSED', 'VALIDATED', 'CANCELED'];
        queryBuilder.andWhere(
          '(incident.current_technician_id IS NULL OR incident.status IN (:...terminalStatuses))',
          { terminalStatuses },
        );
      }

      if (filters.status && filters.status.length > 0) {
        queryBuilder.andWhere('incident.status IN (:...status)', {
          status: filters.status,
        });
      }

      if (filters.issueTypeId) {
        queryBuilder.andWhere('incident.issue_type_id = :issueTypeId', {
          issueTypeId: filters.issueTypeId,
        });
      }

      if (filters.customerEmail) {
        queryBuilder.andWhere('customer.email LIKE :customerEmail', {
          customerEmail: `%${filters.customerEmail}%`,
        });
      }

      if (filters.servicenowNumber) {
        queryBuilder.andWhere('incident.servicenow_number LIKE :snNumber', {
          snNumber: `%${filters.servicenowNumber}%`,
        });
      }

      if (filters.deviceSerial) {
        queryBuilder.andWhere('device.serial_number LIKE :deviceSerial', {
          deviceSerial: `%${filters.deviceSerial}%`,
        });
      }

      if (filters.fromDate) {
        queryBuilder.andWhere('incident.scheduled_start >= :fromDate', {
          fromDate: filters.fromDate,
        });
      }

      if (filters.toDate) {
        queryBuilder.andWhere('incident.scheduled_start <= :toDate', {
          toDate: filters.toDate,
        });
      }

      queryBuilder
        .orderBy('incident.scheduled_start', 'DESC')
        .skip(skip)
        .take(limit);

      const [entities, total] = await queryBuilder.getManyAndCount();

      const data = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          return this.toDomain(
            e,
            slotRelations.map((r) => r.slot_id),
          );
        }),
      );

      return Result.ok({ data, total, page, limit });
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByServiceNowNumber(
    number: string,
  ): Promise<Result<Incident | null>> {
    try {
      const entity = await this.incidentRepository.findOne({
        where: { servicenow_number: number },
        relations: [
          'issueType',
          'customer',
          'corner',
          'currentTechnician',
          'device',
          'locker',
        ],
      });
      if (!entity) return Result.ok(null);
      const slotRelations = await this.incidentSlotRepository.find({
        where: { incident_id: entity.incident_id },
      });
      const domain = await this.toDomain(
        entity,
        slotRelations.map((r) => r.slot_id),
      );
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findBySlotId(slotId: string): Promise<Result<Incident | null>> {
    try {
      const slotRelation = await this.incidentSlotRepository.findOne({
        where: { slot_id: slotId },
      });

      if (!slotRelation) return Result.ok(null);

      return this.findById(slotRelation.incident_id);
    } catch (error) {
      return Result.err(error);
    }
  }

  async update(incident: Incident): Promise<Result<void>> {
    return this.save(incident);
  }

  async findPendingSnowqReconciliation(): Promise<Result<Incident[]>> {
    try {
      const entities = await this.incidentRepository.find({
        where: { snowq_correlation_id: Not(IsNull()), servicenow_id: IsNull() },
        order: { created_at: 'ASC' },
        take: 20,
      });

      const domains = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          return this.toDomain(
            e,
            slotRelations.map((r) => r.slot_id),
          );
        }),
      );

      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findActiveWithServiceNowId(): Promise<Result<Incident[]>> {
    try {
      const activeStatuses = [
        IncidentStatus.CREATED,
        IncidentStatus.DELIVERED,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.PENDING_THIRD_PARTY,
        IncidentStatus.PENDING_USER,
        IncidentStatus.PENDING_SPARE_PART,
        IncidentStatus.PENDING_PICKUP,
        IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
        IncidentStatus.REOPENED,
      ];
      const entities = await this.incidentRepository.find({
        where: {
          status: In(activeStatuses),
          servicenow_id: Not(IsNull()),
        },
      });
      const incidents = await Promise.all(
        entities.map((e) => this.toDomain(e, [])),
      );
      return Result.ok(incidents);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findActiveCustomerIds(): Promise<
    Result<{ customerId: string; externalId: string | null }[]>
  > {
    try {
      const activeStatuses = [
        IncidentStatus.CREATED,
        IncidentStatus.DELIVERED,
        IncidentStatus.IN_PROGRESS,
        IncidentStatus.PENDING_THIRD_PARTY,
        IncidentStatus.PENDING_USER,
        IncidentStatus.PENDING_SPARE_PART,
        IncidentStatus.PENDING_PICKUP,
        IncidentStatus.PENDING_REPLACEMENT_DELIVERY,
        IncidentStatus.REOPENED,
      ];
      const rows = await this.incidentRepository
        .createQueryBuilder('i')
        .select('i.customer_id', 'customerId')
        .addSelect('MAX(u.external_id)', 'externalId')
        .leftJoin('users', 'u', 'u.customer_id = i.customer_id')
        .where('i.status IN (:...statuses)', { statuses: activeStatuses })
        .andWhere('i.customer_id IS NOT NULL')
        .groupBy('i.customer_id')
        .getRawMany<{ customerId: string; externalId: string | null }>();
      return Result.ok(rows);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findOrphanedSnowIncidents(
    minAgeMinutes: number,
  ): Promise<Result<Incident[]>> {
    try {
      const terminalStatuses = [
        IncidentStatus.CLOSED,
        IncidentStatus.VALIDATED,
        IncidentStatus.CANCELED,
      ];
      const cutoff = new Date(Date.now() - minAgeMinutes * 60_000);

      const entities = await this.incidentRepository
        .createQueryBuilder('incident')
        .leftJoinAndSelect('incident.customer', 'customer')
        .where('incident.servicenow_id IS NULL')
        .andWhere('incident.snowq_correlation_id IS NULL')
        .andWhere('incident.status NOT IN (:...terminalStatuses)', {
          terminalStatuses,
        })
        .andWhere('incident.created_at <= :cutoff', { cutoff })
        .orderBy('incident.created_at', 'ASC')
        .take(20)
        .getMany();

      const domains = await Promise.all(
        entities.map(async (e) => {
          const slotRelations = await this.incidentSlotRepository.find({
            where: { incident_id: e.incident_id },
          });
          return this.toDomain(
            e,
            slotRelations.map((r) => r.slot_id),
          );
        }),
      );

      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async saveEvents(incidentId: string, events: any[]): Promise<Result<void>> {
    try {
      for (const event of events) {
        const timelineEntity = new IncidentTimelineEntity();
        timelineEntity.incident_id = incidentId;
        timelineEntity.action_type = event.type;
        timelineEntity.from_status = event.data?.oldStatus;
        timelineEntity.to_status = event.data?.newStatus;
        timelineEntity.technician_id = event.technicianId?.toString();
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

  async getTimeline(
    incidentId: string,
  ): Promise<Result<IncidentTimelineEntry[]>> {
    try {
      const entries = await this.timelineRepository.find({
        where: { incident_id: incidentId },
        relations: ['technician'],
        order: { created_at: 'ASC' },
      });
      const mapped: IncidentTimelineEntry[] = entries.map((e) => ({
        activityId: e.activity_id,
        incidentId: e.incident_id,
        technicianId: e.technician_id ?? null,
        technicianName: e.technician
          ? [e.technician.name, e.technician.last_name]
              .filter(Boolean)
              .join(' ')
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
    incidentId: string,
    technicianId: string | null,
    comment: string,
  ): Promise<Result<void>> {
    try {
      const entry = new IncidentTimelineEntity();
      entry.incident_id = incidentId;
      entry.technician_id = technicianId as string;
      entry.action_type = 'NOTE_ADDED';
      entry.comment = comment;
      entry.created_at = new Date();
      await this.timelineRepository.save(entry);
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  private toEntity(domain: Incident): IncidentEntity {
    const entity = new IncidentEntity();
    entity.incident_id = domain.id.toString();
    entity.issue_type_id = domain.issueTypeId.toString();
    entity.customer_id = domain.customerId.toString();
    entity.corner_id = domain.cornerId.toString();
    entity.device_id = domain.deviceId?.toString() || null;
    entity.locker_id = domain.lockerId?.toString() || null;
    entity.current_technician_id =
      domain.currentTechnicianId?.toString() || null;
    entity.status = domain.status;
    entity.priority = domain.priority;
    entity.origin_channel = domain.origin;
    entity.scheduled_start = domain.scheduledRange.start;
    entity.scheduled_end = domain.scheduledRange.end;
    entity.duration_minutes = domain.durationMinutes;
    entity.servicenow_id = domain.servicenowId?.value || null;
    entity.servicenow_number = domain.servicenowNumber?.value || null;
    entity.snowq_correlation_id = domain.snowqCorrelationId;
    entity.metadata = domain.metadata;
    entity.closed_at = domain.closedAt;
    entity.created_at = domain.createdAt;
    entity.updated_at = domain.updatedAt;
    return entity;
  }

  private toDomain(entity: IncidentEntity, slotIds: string[]): Incident {
    const scheduledRange = DateRange.reconstitute(
      entity.scheduled_start,
      entity.scheduled_end,
    );
    const slotIdObjects = slotIds.map((id) => SlotId(id as any));

    let servicenowId: ServiceNowId | null = null;
    if (entity.servicenow_id) {
      const r = ServiceNowId.create(entity.servicenow_id);
      if (r.isSuccess) servicenowId = r.unwrap();
    }

    let servicenowNumber: ServiceNowNumber | null = null;
    if (entity.servicenow_number) {
      const r = ServiceNowNumber.create(entity.servicenow_number);
      if (r.isSuccess) servicenowNumber = r.unwrap();
    }

    const incident = Incident.reconstitute(
      IncidentId(entity.incident_id),
      IssueTypeId(entity.issue_type_id),
      CustomerId(entity.customer_id),
      CornerId(entity.corner_id),
      slotIdObjects,
      scheduledRange,
      entity.duration_minutes,
      entity.status as IncidentStatus,
      entity.origin_channel as IncidentOrigin,
      entity.priority,
      entity.current_technician_id
        ? TechnicianId(entity.current_technician_id)
        : null,
      entity.device_id || null,
      entity.locker_id ? LockerId(entity.locker_id) : null,
      servicenowId,
      servicenowNumber,
      entity.metadata || {},
      entity.closed_at || null,
      entity.comment || null,
      entity.created_at,
      entity.updated_at,
      entity.snowq_correlation_id || null,
    );

    if (entity.device) {
      incident.setDeviceInfo({
        serialNumber: entity.device.serial_number,
        model: entity.device.model ?? null,
        brand: entity.device.brand ?? null,
      });
    }

    if (entity.customer) {
      incident.setCustomerInfo({
        id: entity.customer.customer_id,
        email: entity.customer.email ?? null,
        name: entity.customer.name ?? null,
      });
    }

    if (entity.currentTechnician) {
      incident.setTechnicianInfo({
        id: entity.currentTechnician.technician_id,
        name:
          entity.currentTechnician.full_name ||
          `${entity.currentTechnician.name}${entity.currentTechnician.last_name ? ' ' + entity.currentTechnician.last_name : ''}`,
      });
    }

    return incident;
  }
}
