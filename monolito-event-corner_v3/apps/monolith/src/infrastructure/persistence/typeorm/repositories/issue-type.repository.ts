import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IIssueTypeRepository } from '../../../../core/ports/outgoing/repositories/issue-type-repository.port';
import { IssueTypeEntity } from '../entities/issue-type.entity';
import { IssueType } from '../../../../core/domain/entities/issue-type.entity';
import { IssueTypeId, IssueTypeTreeId } from '../../../../core/domain/value-objects/ids';
import { IssueCategory } from '../../../../core/domain/enums/issue-category.enum';
import { DeviceType } from '../../../../core/domain/value-objects/device-type.value';
import { Position } from '../../../../core/domain/value-objects/position.value';
import { Result } from '@app/result';
import { WorkMinutes } from '@app/core/domain/value-objects/work-minutes.value';
import { SpareMinutes } from '@app/core/domain/value-objects/spare-minutes.value';
import { CloseMinutes } from '@app/core/domain/value-objects/close-minutes.value';
import { ServiceNowCategory } from '@app/core/domain/value-objects/servicenow-category.value';

@Injectable()
export class TypeOrmIssueTypeRepository implements IIssueTypeRepository {
    constructor(
        @InjectRepository(IssueTypeEntity)
        private readonly repo: Repository<IssueTypeEntity>,
    ) { }

    async save(issueType: IssueType): Promise<Result<void>> {
        try {
            await this.repo.save(this.toEntity(issueType));
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findById(id: IssueTypeId | string): Promise<Result<IssueType | null>> {
        try {
            const entity = await this.repo.findOne({ where: { issue_type_id: id.toString() } });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByTree(treeId: string): Promise<Result<IssueType[]>> {
        try {
            const entities = await this.repo.find({
                where: { tree_id: treeId, is_active: true },
                order: { position: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findAllActive(): Promise<Result<IssueType[]>> {
        try {
            const entities = await this.repo.find({
                where: { is_active: true },
                order: { position: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCategory(category: IssueCategory): Promise<Result<IssueType[]>> {
        try {
            const entities = await this.repo.find({
                where: { category, is_active: true },
                order: { position: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByDeviceType(deviceType: string): Promise<Result<IssueType[]>> {
        try {
            const entities = await this.repo.find({
                where: { device_type: deviceType, is_active: true },
                order: { position: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findVisibleToUsers(): Promise<Result<IssueType[]>> {
        try {
            const entities = await this.repo.find({
                where: { not_user_visible: false, is_active: true },
                order: { position: 'ASC' },
            });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findWithFilters(filters: {
        category?: IssueCategory;
        deviceType?: string;
        visibleToUsers?: boolean;
        treeId?: string;
    }): Promise<Result<IssueType[]>> {
        try {
            const qb = this.repo.createQueryBuilder('it')
                .where('it.is_active = :isActive', { isActive: true });

            if (filters.category) {
                qb.andWhere('it.category = :category', { category: filters.category });
            }
            if (filters.deviceType) {
                qb.andWhere('it.device_type = :deviceType', { deviceType: filters.deviceType });
            }
            if (filters.visibleToUsers !== undefined) {
                qb.andWhere('it.not_user_visible = :notVisible', { notVisible: !filters.visibleToUsers });
            }
            if (filters.treeId) {
                qb.andWhere('it.tree_id = :treeId', { treeId: filters.treeId });
            }

            qb.orderBy('it.position', 'ASC');
            const entities = await qb.getMany();
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async update(issueType: IssueType): Promise<Result<void>> {
        try {
            const entity = this.toEntity(issueType);
            await this.repo.update(
                { issue_type_id: entity.issue_type_id },
                {
                    name: entity.name,
                    category: entity.category,
                    device_type: entity.device_type,
                    servicenow_category: entity.servicenow_category,
                    servicenow_close_category: entity.servicenow_close_category,
                    work_minutes: entity.work_minutes,
                    spare_minutes: entity.spare_minutes,
                    close_minutes: entity.close_minutes,
                    not_user_visible: entity.not_user_visible,
                    position: entity.position,
                    icon: entity.icon,
                    nps_disabled: entity.nps_disabled,
                    is_active: entity.is_active,
                    updated_at: entity.updated_at,
                },
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async delete(id: IssueTypeId | string): Promise<Result<void>> {
        try {
            await this.repo.update(
                { issue_type_id: id.toString() },
                { is_active: false, updated_at: new Date() },
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    // ── Mapeadores ───────────────────────────────────────────────────────────

    private toEntity(domain: IssueType): IssueTypeEntity {
        const entity = new IssueTypeEntity();
        entity.issue_type_id = domain.id.toString();
        entity.tree_id = domain.treeId.toString();
        entity.name = domain.name;
        entity.category = domain.category;
        entity.device_type = domain.deviceType?.value || null;
        entity.servicenow_category = domain.servicenowCategory?.value || null;
        entity.servicenow_close_category = domain.servicenowCloseCategory?.value || null;
        entity.work_minutes = domain.workMinutes.value;
        entity.spare_minutes = domain.spareMinutes.value;
        entity.close_minutes = domain.closeMinutes.value;
        entity.not_user_visible = domain.notUserVisible;
        entity.position = domain.position.value;
        entity.nps_disabled = domain.npsDisabled;
        entity.is_active = domain.isActive;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;
        return entity;
    }

    private toDomain(entity: IssueTypeEntity): IssueType {
        const deviceTypeResult = entity.device_type ? DeviceType.create(entity.device_type) : null;
        const deviceType = deviceTypeResult?.isSuccess ? deviceTypeResult.unwrap() : null;

        const servicenowCategoryResult = entity.servicenow_category
            ? ServiceNowCategory.create(entity.servicenow_category) : null;
        const servicenowCategory = servicenowCategoryResult?.isSuccess
            ? servicenowCategoryResult.unwrap() : null;

        const servicenowCloseCategoryResult = entity.servicenow_close_category
            ? ServiceNowCategory.create(entity.servicenow_close_category) : null;
        const servicenowCloseCategory = servicenowCloseCategoryResult?.isSuccess
            ? servicenowCloseCategoryResult.unwrap() : null;

        const workMinutesResult = WorkMinutes.create(entity.work_minutes);
        const spareMinutesResult = SpareMinutes.create(entity.spare_minutes);
        const closeMinutesResult = CloseMinutes.create(entity.close_minutes);
        const positionResult = Position.create(entity.position);

        if (workMinutesResult.isFailure) throw new Error(`Invalid work_minutes in DB for issue_type ${entity.issue_type_id}: ${entity.work_minutes}`);
        if (spareMinutesResult.isFailure) throw new Error(`Invalid spare_minutes in DB for issue_type ${entity.issue_type_id}: ${entity.spare_minutes}`);
        if (closeMinutesResult.isFailure) throw new Error(`Invalid close_minutes in DB for issue_type ${entity.issue_type_id}: ${entity.close_minutes}`);
        if (positionResult.isFailure) throw new Error(`Invalid position in DB for issue_type ${entity.issue_type_id}: ${entity.position}`);

        return IssueType.reconstitute(
            IssueTypeId(entity.issue_type_id as any),
            IssueTypeTreeId(entity.tree_id as any),
            entity.name,
            entity.category as IssueCategory,
            deviceType,
            servicenowCategory,
            servicenowCloseCategory,
            workMinutesResult.unwrap(),
            spareMinutesResult.unwrap(),
            closeMinutesResult.unwrap(),
            entity.not_user_visible,
            positionResult.unwrap(),
            entity.nps_disabled,
            entity.is_active,
            entity.created_at,
            entity.updated_at,
        );
    }
}
