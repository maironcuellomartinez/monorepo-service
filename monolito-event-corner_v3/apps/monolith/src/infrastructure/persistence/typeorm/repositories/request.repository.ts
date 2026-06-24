// infrastructure/persistence/typeorm/repositories/request.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, IsNull, Not } from 'typeorm';
import { IRequestRepository, RequestFilters } from '../../../../core/ports/outgoing/repositories/request-repository.port';
import { PaginatedResult } from '../../../../core/ports/outgoing/repositories/incident-repository.port';
import { RequestEntity } from '../entities/request.entity';
import { RequestActivityEntity } from '../entities/request-activity.entity';
import { Request } from '../../../../core/domain/entities/request.entity';
import { RequestId, TechnicianId, CustomerId, CompanyId, CornerId, IssueTypeId, DeviceId } from '../../../../core/domain/value-objects/ids';
import { Result } from '@app/result';
import { ServiceNowId } from '@app/core/domain/value-objects/servicenow-id.value';
import { ServiceNowNumber } from '@app/core/domain/value-objects/servicenow-number.value';

@Injectable()
export class TypeOrmRequestRepository implements IRequestRepository {
    constructor(
        @InjectRepository(RequestEntity)
        private readonly repo: Repository<RequestEntity>,
        @InjectRepository(RequestActivityEntity)
        private readonly activityRepo: Repository<RequestActivityEntity>,
    ) { }

    async save(request: Request): Promise<Result<void>> {
        try {
            const entity = this.toEntity(request);
            await this.repo.save(entity);

            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findById(id: RequestId | string): Promise<Result<Request | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { request_id: id.toString() },
                relations: ['issueType', 'technician', 'customer', 'corner', 'company', 'device'],
            });

            if (!entity) return Result.ok(null);

            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByTechnician(technicianId: string | TechnicianId): Promise<Result<Request[]>> {
        try {
            const entities = await this.repo.find({
                where: { technician_id: technicianId.toString() },
                relations: ['issueType', 'technician', 'customer', 'corner', 'company', 'device'],
                order: { scheduled_at: 'DESC' },
            });

            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCustomer(customerId: string | CustomerId): Promise<Result<Request[]>> {
        try {
            const entities = await this.repo.find({
                where: { customer_id: customerId.toString() },
                relations: ['issueType', 'technician', 'customer', 'corner', 'company', 'device'],
                order: { scheduled_at: 'DESC' },
            });

            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCompany(companyId: string | CompanyId): Promise<Result<Request[]>> {
        try {
            const entities = await this.repo.find({
                where: { company_id: companyId.toString() },
                relations: ['issueType', 'technician', 'customer', 'corner', 'company', 'device'],
                order: { scheduled_at: 'DESC' },
            });

            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCorner(cornerId: string): Promise<Result<Request[]>> {
        try {
            const entities = await this.repo.find({
                where: { corner_id: cornerId },
                relations: ['issueType', 'technician', 'customer', 'corner', 'company', 'device'],
                order: { scheduled_at: 'DESC' },
            });

            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByDateRange(start: Date, end: Date): Promise<Result<Request[]>> {
        try {
            const entities = await this.repo.find({
                where: {
                    scheduled_at: Between(start, end),
                },
                relations: ['issueType', 'technician', 'customer', 'corner', 'company', 'device'],
                order: { scheduled_at: 'ASC' },
            });

            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findWithFilters(filters: RequestFilters): Promise<Result<PaginatedResult<Request>>> {
        try {
            const page  = filters.page  ?? 1;
            const limit = Math.min(filters.limit ?? 20, 100);
            const skip  = (page - 1) * limit;

            const queryBuilder = this.repo.createQueryBuilder('request')
                .leftJoinAndSelect('request.issueType', 'issueType')
                .leftJoinAndSelect('request.technician', 'technician')
                .leftJoinAndSelect('request.customer', 'customer')
                .leftJoinAndSelect('request.corner', 'corner')
                .leftJoinAndSelect('request.company', 'company')
                .leftJoinAndSelect('request.device', 'device');

            if (filters.technicianId) {
                queryBuilder.andWhere('request.technician_id = :technicianId', { technicianId: filters.technicianId });
            }

            if (filters.customerId) {
                queryBuilder.andWhere('request.customer_id = :customerId', { customerId: filters.customerId });
            }

            if (filters.companyId) {
                queryBuilder.andWhere('request.company_id = :companyId', { companyId: filters.companyId });
            }

            if (filters.cornerId) {
                queryBuilder.andWhere('request.corner_id = :cornerId', { cornerId: filters.cornerId });
            }

            if (filters.issueTypeId) {
                queryBuilder.andWhere('request.issue_type_id = :issueTypeId', { issueTypeId: filters.issueTypeId });
            }

            if (filters.status && filters.status.length > 0) {
                queryBuilder.andWhere('request.status IN (:...status)', { status: filters.status });
            }

            if (filters.fromDate) {
                queryBuilder.andWhere('request.scheduled_at >= :fromDate', { fromDate: filters.fromDate });
            }

            if (filters.toDate) {
                queryBuilder.andWhere('request.scheduled_at <= :toDate', { toDate: filters.toDate });
            }

            queryBuilder.orderBy('request.scheduled_at', 'DESC').skip(skip).take(limit);

            const [entities, total] = await queryBuilder.getManyAndCount();
            return Result.ok({ data: entities.map(e => this.toDomain(e)), total, page, limit });
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByServiceNowNumber(number: string): Promise<Result<Request | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { servicenow_number: number },
                relations: ['issueType', 'technician', 'customer', 'corner', 'company', 'device'],
            });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error);
        }
    }

    async update(request: Request): Promise<Result<void>> {
        return this.save(request);
    }

    async findPendingSnowqReconciliation(): Promise<Result<Request[]>> {
        try {
            const entities = await this.repo.find({
                where: { snowq_correlation_id: Not(IsNull()), servicenow_id: IsNull() },
                order: { created_at: 'ASC' },
                take: 20,
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async delete(id: RequestId | string): Promise<Result<void>> {
        try {
            // Soft delete - marcar como cancelado
            await this.repo.update(
                { request_id: id.toString() },
                {
                    status: 'CANCELED',
                    updated_at: new Date()
                }
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async saveEvents(requestId: string, events: any[]): Promise<Result<void>> {
        try {
            for (const event of events) {
                const activityEntity = new RequestActivityEntity();
                activityEntity.request_id = requestId;
                activityEntity.technician_id = event.technicianId?.toString() || '';
                activityEntity.from_status = event.data?.oldStatus;
                activityEntity.to_status = event.data?.newStatus || event.type;
                activityEntity.comment = event.data?.comment || event.data?.reason;
                activityEntity.created_at = event.timestamp || new Date();

                await this.activityRepo.save(activityEntity);
            }

            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    private toEntity(domain: Request): RequestEntity {
        const entity = new RequestEntity();
        entity.request_id = domain.id.toString();
        entity.issue_type_id = domain.issueTypeId.toString();
        entity.technician_id = domain.technicianId.toString();
        entity.customer_id = domain.customerId.toString();
        entity.corner_id = domain.cornerId.toString();
        entity.company_id = domain.companyId.toString();
        entity.device_id = domain.deviceId?.toString() || null;
        entity.status = domain.status;
        entity.scheduled_at = domain.scheduledAt;
        entity.servicenow_id = domain.servicenowId?.value || null;
        entity.servicenow_number = domain.servicenowNumber?.value || null;
        entity.snowq_correlation_id = domain.snowqCorrelationId;
        entity.notes = domain.notes;
        entity.closed_at = domain.closedAt;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;
        return entity;
    }

    private toDomain(entity: RequestEntity): Request {
        return Request.reconstitute(
            RequestId(entity.request_id as any),
            IssueTypeId(entity.issue_type_id as any),
            TechnicianId(entity.technician_id as any),
            CustomerId(entity.customer_id as any),
            CornerId(entity.corner_id as any),
            CompanyId(entity.company_id as any),
            entity.device_id ? DeviceId(entity.device_id as any) : null,
            entity.status,
            entity.scheduled_at,
            entity.servicenow_id ? ServiceNowId.create(entity.servicenow_id).unwrap() : null,
            entity.servicenow_number ? ServiceNowNumber.create(entity.servicenow_number).unwrap() : null,
            entity.notes,
            entity.closed_at,
            entity.created_at,
            entity.updated_at,
            entity.snowq_correlation_id || null,
        );
    }
}