// infrastructure/persistence/typeorm/repositories/servicenow-ticket-link.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import {
  ITicketLinkRepository,
} from '../../../../core/ports/outgoing/repositories/servicenow-ticket-link-repository.port';
import { ServiceNowTicketLinkEntity } from '../entities/servicenow-ticket-link.entity';
import {
  ServiceNowTicketLink,
  ServiceNowTicketLinkRole,
  ServiceNowTicketLinkStatus,
} from '../../../../core/domain/entities/servicenow-ticket-link.entity';
import { ServiceNowId } from '../../../../core/domain/value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../../../../core/domain/value-objects/servicenow-number.value';
import { ServiceNowTicketType } from '../../../../core/domain/value-objects/servicenow-ticket-type.value';
import { AppointmentId } from '@app/shared/types/branded-ids';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmServiceNowTicketLinkRepository implements ITicketLinkRepository {
  constructor(
    @InjectRepository(ServiceNowTicketLinkEntity)
    private readonly repo: Repository<ServiceNowTicketLinkEntity>,
  ) {}

  async save(link: ServiceNowTicketLink): Promise<Result<void>> {
    try {
      await this.repo.save(this.toEntity(link));
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async update(link: ServiceNowTicketLink): Promise<Result<void>> {
    return this.save(link);
  }

  async findById(id: string): Promise<Result<ServiceNowTicketLink | null>> {
    try {
      const entity = await this.repo.findOne({ where: { id } });
      return Result.ok(entity ? this.toDomain(entity) : null);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByAppointmentId(
    appointmentId: AppointmentId | string,
  ): Promise<Result<ServiceNowTicketLink[]>> {
    try {
      const entities = await this.repo.find({
        where: { appointment_id: appointmentId.toString() },
        order: { created_at: 'ASC' },
      });
      return Result.ok(entities.map((e) => this.toDomain(e)));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findPendingSnowqReconciliation(): Promise<Result<ServiceNowTicketLink[]>> {
    try {
      const entities = await this.repo.find({
        where: { snowq_correlation_id: Not(IsNull()), sys_id: IsNull() },
        order: { created_at: 'ASC' },
        take: 20,
      });
      return Result.ok(entities.map((e) => this.toDomain(e)));
    } catch (error) {
      return Result.err(error);
    }
  }

  private toEntity(domain: ServiceNowTicketLink): ServiceNowTicketLinkEntity {
    const entity = new ServiceNowTicketLinkEntity();
    entity.id = domain.id;
    entity.appointment_id = domain.appointmentId.toString();
    entity.type = domain.type;
    entity.role = domain.role;
    entity.sys_id = domain.sysId?.value ?? null;
    entity.number = domain.number?.value ?? null;
    entity.parent_request_sys_id = domain.parentRequestSysId;
    entity.snowq_correlation_id = domain.snowqCorrelationId;
    entity.status = domain.status;
    entity.closed_at = domain.closedAt;
    entity.created_at = domain.createdAt;
    entity.updated_at = domain.updatedAt;
    return entity;
  }

  private toDomain(entity: ServiceNowTicketLinkEntity): ServiceNowTicketLink {
    let sysId: ServiceNowId | null = null;
    if (entity.sys_id) {
      const r = ServiceNowId.create(entity.sys_id);
      if (r.isSuccess) sysId = r.unwrap();
    }

    let number: ServiceNowNumber | null = null;
    if (entity.number) {
      const r = ServiceNowNumber.create(entity.number);
      if (r.isSuccess) number = r.unwrap();
    }

    return ServiceNowTicketLink.reconstitute({
      id: entity.id,
      appointmentId: AppointmentId(entity.appointment_id),
      type: entity.type as ServiceNowTicketType,
      role: entity.role as ServiceNowTicketLinkRole,
      sysId,
      number,
      parentRequestSysId: entity.parent_request_sys_id,
      snowqCorrelationId: entity.snowq_correlation_id,
      status: entity.status as ServiceNowTicketLinkStatus,
      closedAt: entity.closed_at,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
    });
  }
}
