// core/services/admin/issue-type.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { CreateIssueTypeCommand, IIssueTypeService, UpdateIssueTypeCommand } from '../../ports/incoming/admin/issue-type-service.port';
import { IIssueTypeRepository, ISSUE_TYPE_REPOSITORY } from '../../ports/outgoing/repositories/issue-type-repository.port';
import { IIssueTypeTreeRepository, ISSUE_TYPE_TREE_REPOSITORY } from '../../ports/outgoing/repositories/issue-type-tree-repository.port';
import { IEventBus } from '../../ports/outgoing/event-bus/event-bus.port';
import { DomainEvent } from '@app/shared/domain-event';
import { IssueType } from '../../domain/entities/issue-type.entity';
import { IssueTypeId, IssueTypeTreeId } from '../../domain/value-objects/ids';
import { DeviceType } from '../../domain/value-objects/device-type.value';
import { Position } from '../../domain/value-objects/position.value';
import { IssueCategory } from '../../domain/enums/issue-category.enum';
import { Result } from '@app/result';
import { WorkMinutes } from '@app/core/domain/value-objects/work-minutes.value';
import { SpareMinutes } from '@app/core/domain/value-objects/spare-minutes.value';
import { CloseMinutes } from '@app/core/domain/value-objects/close-minutes.value';
import { ServiceNowCategory } from '@app/core/domain/value-objects/servicenow-category.value';
import { IssueTypeNotFoundError, IssueTypeTreeNotFoundError } from '@app/shared/errors/domain-error';
import { TracingService } from '@app/observability';

@Injectable()
export class IssueTypeService implements IIssueTypeService {
    constructor(
        @Inject(ISSUE_TYPE_REPOSITORY) private readonly issueTypeRepo: IIssueTypeRepository,
        @Inject(ISSUE_TYPE_TREE_REPOSITORY) private readonly treeRepo: IIssueTypeTreeRepository,
        private readonly eventBus: IEventBus,
        private readonly tracing: TracingService,
    ) { }

    async createIssueType(command: CreateIssueTypeCommand): Promise<Result<IssueType>> {
        return this.tracing.run(
            'monolith.createIssueType',
            { kind: 'server', attributes: { 'issueType.name': command.name } },
            () => this._createIssueType(command),
        );
    }

    private async _createIssueType(command: CreateIssueTypeCommand): Promise<Result<IssueType>> {
        // 1. Resolver árbol — usa el provisto o el primero disponible
        let resolvedTreeId = command.treeId;
        if (!resolvedTreeId) {
            const allTrees = await this.treeRepo.findAll();
            if (allTrees.isFailure) return Result.err(allTrees.unwrapError());
            const first = allTrees.unwrap()[0];
            if (!first) return Result.err(new Error('No hay ningún árbol de tipos de cita configurado'));
            resolvedTreeId = first.id as unknown as string;
        } else {
            const treeResult = await this.treeRepo.findById(resolvedTreeId);
            if (treeResult.isFailure) return Result.err(treeResult.unwrapError());
            if (!treeResult.unwrap()) return Result.err(new IssueTypeTreeNotFoundError(resolvedTreeId));
        }

        // 2. Crear Value Objects
        const deviceType = command.deviceType
            ? DeviceType.create(command.deviceType)
            : Result.ok(null);
        if (deviceType.isFailure) return Result.err(deviceType.unwrapError());

        const position = Position.create(command.position ?? 0);
        if (position.isFailure) return Result.err(position.unwrapError());

        const workMinutes = WorkMinutes.create(command.workMinutes ?? 60);
        if (workMinutes.isFailure) return Result.err(workMinutes.unwrapError());

        const spareMinutes = SpareMinutes.create(command.spareMinutes ?? 0);
        if (spareMinutes.isFailure) return Result.err(spareMinutes.unwrapError());

        const closeMinutes = CloseMinutes.create(command.closeMinutes ?? 0);
        if (closeMinutes.isFailure) return Result.err(closeMinutes.unwrapError());

        const servicenowCategory = command.servicenowCategory
            ? ServiceNowCategory.create(command.servicenowCategory)
            : Result.ok(null);
        if (servicenowCategory.isFailure) return Result.err(servicenowCategory.unwrapError());

        const servicenowCloseCategory = command.servicenowCloseCategory
            ? ServiceNowCategory.create(command.servicenowCloseCategory)
            : Result.ok(null);
        if (servicenowCloseCategory.isFailure) return Result.err(servicenowCloseCategory.unwrapError());

        // 3. Crear entidad
        const issueTypeId = crypto.randomUUID() as unknown as IssueTypeId;
        const issueTypeResult = IssueType.create(
            issueTypeId,
            IssueTypeTreeId(resolvedTreeId as any),
            command.name,
            command.category,
            deviceType.unwrap(),
            workMinutes.unwrap(),
            spareMinutes.unwrap(),
            closeMinutes.unwrap(),
            command.notUserVisible ?? false,
            position.unwrap(),
            command.npsDisabled ?? false,
            servicenowCategory.unwrap() || undefined,
            servicenowCloseCategory.unwrap() || undefined,
        );
        if (issueTypeResult.isFailure) return issueTypeResult;

        const issueType = issueTypeResult.unwrap();

        // 4. Guardar
        const saveResult = await this.issueTypeRepo.save(issueType);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        // 5. Publicar evento
        await this.eventBus.publish(new DomainEvent('ISSUE_TYPE_CREATED', issueTypeId.toString(), 'IssueType', {
            name: command.name, category: command.category, treeId: resolvedTreeId,
        }));

        return Result.ok(issueType);
    }

    async updateIssueType(command: UpdateIssueTypeCommand): Promise<Result<IssueType>> {
        return this.tracing.run(
            'monolith.updateIssueType',
            { kind: 'server', attributes: { 'issueType.id': command.id } },
            () => this._updateIssueType(command),
        );
    }

    private async _updateIssueType(command: UpdateIssueTypeCommand): Promise<Result<IssueType>> {
        // 1. Obtener el tipo existente
        const existingResult = await this.issueTypeRepo.findById(command.id);
        if (existingResult.isFailure) return Result.err(existingResult.unwrapError());
        const existing = existingResult.unwrap();
        if (!existing) {
            return Result.err(new IssueTypeNotFoundError(command.id));
        }

        // 2. Preparar Value Objects solo para campos que vienen
        const deviceType = command.deviceType !== undefined
            ? command.deviceType
                ? DeviceType.create(command.deviceType)
                : Result.ok(null)
            : null;
        if (deviceType && deviceType.isFailure) return Result.err(deviceType.unwrapError());

        const position = command.position !== undefined
            ? Position.create(command.position)
            : null;
        if (position && position.isFailure) return Result.err(position.unwrapError());

        const workMinutes = command.workMinutes !== undefined
            ? WorkMinutes.create(command.workMinutes)
            : null;
        if (workMinutes && workMinutes.isFailure) return Result.err(workMinutes.unwrapError());

        const spareMinutes = command.spareMinutes !== undefined
            ? SpareMinutes.create(command.spareMinutes)
            : null;
        if (spareMinutes && spareMinutes.isFailure) return Result.err(spareMinutes.unwrapError());

        const closeMinutes = command.closeMinutes !== undefined
            ? CloseMinutes.create(command.closeMinutes)
            : null;
        if (closeMinutes && closeMinutes.isFailure) return Result.err(closeMinutes.unwrapError());

        const servicenowCategory = command.servicenowCategory !== undefined
            ? command.servicenowCategory
                ? ServiceNowCategory.create(command.servicenowCategory)
                : Result.ok(null)
            : null;
        if (servicenowCategory && servicenowCategory.isFailure) return Result.err(servicenowCategory.unwrapError());

        const servicenowCloseCategory = command.servicenowCloseCategory !== undefined
            ? command.servicenowCloseCategory
                ? ServiceNowCategory.create(command.servicenowCloseCategory)
                : Result.ok(null)
            : null;
        if (servicenowCloseCategory && servicenowCloseCategory.isFailure) return Result.err(servicenowCloseCategory.unwrapError());

        // 3. Actualizar la entidad
        existing.update(
            command.name ?? existing.name,
            command.category ?? existing.category,
            deviceType !== null ? (deviceType?.unwrap() ?? null) : existing.deviceType,
            servicenowCategory !== null ? (servicenowCategory?.unwrap() ?? null) : existing.servicenowCategory,
            servicenowCloseCategory !== null ? (servicenowCloseCategory?.unwrap() ?? null) : existing.servicenowCloseCategory,
            workMinutes !== null ? (workMinutes?.unwrap() ?? existing.workMinutes) : existing.workMinutes,
            spareMinutes !== null ? (spareMinutes?.unwrap() ?? existing.spareMinutes) : existing.spareMinutes,
            closeMinutes !== null ? (closeMinutes?.unwrap() ?? existing.closeMinutes) : existing.closeMinutes,
            command.notUserVisible ?? existing.notUserVisible,
            position !== null ? (position?.unwrap() ?? existing.position) : existing.position,
            command.npsDisabled ?? existing.npsDisabled,
        );

        // 4. Guardar
        const updateResult = await this.issueTypeRepo.update(existing);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        // 5. Publicar evento
        await this.eventBus.publish(new DomainEvent('ISSUE_TYPE_UPDATED', command.id, 'IssueType', { id: command.id }));

        return Result.ok(existing);
    }

    async deleteIssueType(id: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.deleteIssueType',
            { kind: 'server', attributes: { 'issueType.id': id } },
            () => this._deleteIssueType(id),
        );
    }

    private async _deleteIssueType(id: string): Promise<Result<void>> {
        // 1. Verificar que existe
        const existingResult = await this.issueTypeRepo.findById(id);
        if (existingResult.isFailure) return Result.err(existingResult.unwrapError());
        const existing = existingResult.unwrap();
        if (!existing) {
            return Result.err(new IssueTypeNotFoundError(id));
        }

        // 2. Soft delete (desactivar)
        existing.deactivate();

        // 3. Guardar
        const updateResult = await this.issueTypeRepo.update(existing);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        // 4. Publicar evento
        await this.eventBus.publish(new DomainEvent('ISSUE_TYPE_DELETED', id, 'IssueType', { id }));

        return Result.ok(undefined);
    }

    async getIssueType(id: string): Promise<Result<IssueType | null>> {
        return this.issueTypeRepo.findById(id);
    }

    async listIssueTypes(filters?: {
        treeId?: string;
        category?: IssueCategory;
        deviceType?: string;
        visibleToUsers?: boolean;
    }): Promise<Result<IssueType[]>> {
        // Si se provee treeId, filtrar por árbol; si no, devolver todos los activos
        const result = filters?.treeId
            ? await this.issueTypeRepo.findByTree(filters.treeId)
            : await this.issueTypeRepo.findAllActive();
        if (result.isFailure) return result;

        let types = result.unwrap();

        // Aplicar filtros adicionales
        if (filters?.category) {
            types = types.filter(t => t.category === filters.category);
        }

        if (filters?.deviceType) {
            types = types.filter(t => t.deviceType?.value === filters.deviceType);
        }

        if (filters?.visibleToUsers !== undefined) {
            types = types.filter(t => t.isVisibleToUser() === filters.visibleToUsers);
        }

        // Ordenar por posición
        types.sort((a, b) => a.position.value - b.position.value);

        return Result.ok(types);
    }
}
