// core/services/batch-draft/batch-draft.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Result } from '@app/result';
import { SlotId } from '@app/shared/types/branded-ids';
import { ISlotRepository } from '../../ports/outgoing/repositories/slot-repository.port';
import { SLOT_REPOSITORY } from '../../ports/outgoing/repositories/tokens';
import { INCIDENT_SERVICE } from '../../ports/incoming/service-tokens';
import { IIncidentService } from '../../ports/incoming/incident/incident-service.port';
import { TracingService } from '@app/observability';
import { TypeOrmBatchDraftRepository } from '../../../infrastructure/persistence/typeorm/repositories/batch-draft.repository';
import {
    BatchDraftData,
    BatchDraftItemData,
    AddBatchItemCommand,
    EditBatchItemCommand,
    BatchSubmitResultItem,
} from './batch-draft.types';

const HOLD_TTL_MINUTES = 15;
const CTX = 'BatchDraftService';

@Injectable()
export class BatchDraftService {
    private readonly logger = new Logger(BatchDraftService.name);

    constructor(
        private readonly repo: TypeOrmBatchDraftRepository,
        @Inject(SLOT_REPOSITORY) private readonly slotRepo: ISlotRepository,
        @Inject(INCIDENT_SERVICE) private readonly incidentService: IIncidentService,
        private readonly tracing: TracingService,
    ) {}

    async getMyDraft(userId: string): Promise<Result<BatchDraftData | null>> {
        return this.repo.findByUserId(userId);
    }

    async addItem(userId: string, cmd: AddBatchItemCommand): Promise<Result<BatchDraftItemData>> {
        return this.tracing.run(
            'monolith.batchDraft.addItem',
            { kind: 'server', attributes: { 'batchDraft.userId': userId, 'batchDraft.localId': cmd.localId } },
            () => this._addItem(userId, cmd),
        );
    }

    private async _addItem(userId: string, cmd: AddBatchItemCommand): Promise<Result<BatchDraftItemData>> {
        const draftResult = await this.repo.getOrCreateDraft(userId);
        if (draftResult.isFailure) return Result.err(draftResult.unwrapError());
        const draft = draftResult.unwrap();

        // Idempotencia: si ya existe un item con el mismo localId, devolverlo
        const existing = await this.repo.findItemByLocalId(draft.id, cmd.localId);
        if (!existing.isFailure && existing.unwrap()) {
            return Result.ok(existing.unwrap()!);
        }

        // Validar que el slot no sea pasado
        const startTime = new Date(cmd.startTime);
        if (startTime <= new Date()) {
            return Result.err(new Error('El horario seleccionado ya pasó'));
        }

        // Holdear los slots de forma atómica
        const slotIds = cmd.slotIds.map((id) => SlotId(id as any));
        const holdResult = await this.slotRepo.holdManyAtomic(slotIds, userId, HOLD_TTL_MINUTES);
        if (holdResult.isFailure) return Result.err(holdResult.unwrapError());
        const held = holdResult.unwrap();
        if (held < slotIds.length) {
            this.logger.warn(`addItem — hold conflict: expected ${slotIds.length}, held ${held} for user ${userId}`, CTX);
            return Result.err(new Error('El horario seleccionado ya no está disponible. Otro técnico lo reservó.'));
        }

        const itemResult = await this.repo.addItem(draft.id, {
            localId: cmd.localId,
            cornerId: cmd.cornerId,
            cornerName: cmd.cornerName,
            customerId: cmd.customerId,
            customerName: cmd.customerName,
            customerEmail: cmd.customerEmail,
            deviceSerial: cmd.deviceSerial,
            issueTypeId: cmd.issueTypeId,
            issueTypeName: cmd.issueTypeName,
            slotIds: cmd.slotIds,
            startTime: new Date(cmd.startTime),
            endTime: new Date(cmd.endTime),
            description: cmd.description,
            notes: cmd.notes ?? '',
            status: 'pending',
            lastError: null,
        });

        if (itemResult.isFailure) {
            // Rollback holds si no se pudo guardar el item
            await this.slotRepo.releaseHoldsAtomic(slotIds, userId);
        }
        return itemResult;
    }

    async editItem(userId: string, itemId: string, cmd: EditBatchItemCommand): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.batchDraft.editItem',
            { kind: 'server', attributes: { 'batchDraft.userId': userId, 'batchDraft.itemId': itemId } },
            () => this._editItem(userId, itemId, cmd),
        );
    }

    private async _editItem(userId: string, itemId: string, cmd: EditBatchItemCommand): Promise<Result<void>> {
        const itemResult = await this.repo.findItemById(itemId);
        if (itemResult.isFailure) return Result.err(itemResult.unwrapError());
        const item = itemResult.unwrap();
        if (!item) return Result.err(new Error(`Item ${itemId} not found`));

        // Si cambiaron los slots: liberar los viejos y holdear los nuevos
        const slotsChanged = cmd.slotIds && JSON.stringify(cmd.slotIds.sort()) !== JSON.stringify([...item.slotIds].sort());
        if (slotsChanged && cmd.slotIds) {
            const oldIds = item.slotIds.map((id) => SlotId(id as any));
            await this.slotRepo.releaseHoldsAtomic(oldIds, userId);

            const newIds = cmd.slotIds.map((id) => SlotId(id as any));
            const holdResult = await this.slotRepo.holdManyAtomic(newIds, userId, HOLD_TTL_MINUTES);
            if (holdResult.isFailure) return Result.err(holdResult.unwrapError());
            const held = holdResult.unwrap();
            if (held < newIds.length) {
                // Rollback: re-holdear los viejos
                await this.slotRepo.holdManyAtomic(oldIds, userId, HOLD_TTL_MINUTES);
                return Result.err(new Error('El nuevo horario ya no está disponible'));
            }
        }

        const startTime = cmd.startTime ? new Date(cmd.startTime) : undefined;
        if (startTime && startTime <= new Date()) {
            return Result.err(new Error('El horario seleccionado ya pasó'));
        }

        return this.repo.updateItem(itemId, {
            ...cmd,
            startTime: startTime,
            endTime: cmd.endTime ? new Date(cmd.endTime) : undefined,
            status: 'pending',
            lastError: null,
        });
    }

    async removeItem(userId: string, itemId: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.batchDraft.removeItem',
            { kind: 'server', attributes: { 'batchDraft.userId': userId, 'batchDraft.itemId': itemId } },
            () => this._removeItem(userId, itemId),
        );
    }

    private async _removeItem(userId: string, itemId: string): Promise<Result<void>> {
        const itemResult = await this.repo.findItemById(itemId);
        if (itemResult.isFailure) return Result.err(itemResult.unwrapError());
        const item = itemResult.unwrap();
        if (!item) return Result.err(new Error(`Item ${itemId} not found`));

        const slotIds = item.slotIds.map((id) => SlotId(id as any));
        await this.slotRepo.releaseHoldsAtomic(slotIds, userId);
        await this.repo.removeItem(itemId);

        // Si el draft quedó vacío, eliminarlo
        const remaining = await this.repo.countItems(item.draftId);
        if (remaining === 0) {
            await this.repo.deleteDraft(userId);
        }

        return Result.ok(undefined);
    }

    async submit(userId: string): Promise<Result<BatchSubmitResultItem[]>> {
        return this.tracing.run(
            'monolith.batchDraft.submit',
            { kind: 'server', attributes: { 'batchDraft.userId': userId } },
            () => this._submit(userId),
        );
    }

    private async _submit(userId: string): Promise<Result<BatchSubmitResultItem[]>> {
        const draftResult = await this.repo.findByUserId(userId);
        if (draftResult.isFailure) return Result.err(draftResult.unwrapError());
        const draft = draftResult.unwrap();
        if (!draft || draft.items.length === 0) {
            return Result.err(new Error('No hay items en el lote'));
        }

        const results: BatchSubmitResultItem[] = [];
        const now = new Date();

        for (const item of draft.items.filter((i) => i.status === 'pending' || i.status === 'error')) {
            // Validar que el slot no sea pasado
            if (item.startTime <= now) {
                await this.repo.updateItem(item.id, {
                    status: 'error',
                    lastError: 'El horario ya pasó. Editá la incidencia y elegí un nuevo horario.',
                });
                results.push({ localId: item.localId, status: 'error', error: 'El horario ya pasó' });
                continue;
            }

            try {
                const incidentResult = await this.incidentService.createIncident({
                    issueTypeId: item.issueTypeId as any,
                    customerId: item.customerId as any,
                    cornerId: item.cornerId as any,
                    slotIds: item.slotIds as any[],
                    origin: 'event-corner-app-batch',
                    device: { serialNumber: item.deviceSerial },
                    metadata: item.description ? { description: item.description, notes: item.notes } : undefined,
                    heldByUserId: userId,
                });

                if (incidentResult.isFailure) {
                    const msg = incidentResult.unwrapError().message;
                    await this.repo.updateItem(item.id, { status: 'error', lastError: msg });
                    results.push({ localId: item.localId, status: 'error', error: msg });
                } else {
                    const incident = incidentResult.unwrap();
                    await this.repo.removeItem(item.id);
                    results.push({ localId: item.localId, status: 'success', incidentId: incident.id.toString() });
                }
            } catch (err: any) {
                const msg = err?.message ?? 'Error inesperado';
                await this.repo.updateItem(item.id, { status: 'error', lastError: msg });
                results.push({ localId: item.localId, status: 'error', error: msg });
            }
        }

        // Si todos los items se procesaron con éxito → eliminar draft
        const remaining = await this.repo.countItems(draft.id);
        if (remaining === 0) {
            await this.repo.deleteDraft(userId);
        }

        return Result.ok(results);
    }

    async discard(userId: string): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.batchDraft.discard',
            { kind: 'server', attributes: { 'batchDraft.userId': userId } },
            () => this._discard(userId),
        );
    }

    private async _discard(userId: string): Promise<Result<void>> {
        const draftResult = await this.repo.findByUserId(userId);
        if (draftResult.isFailure) return Result.err(draftResult.unwrapError());
        const draft = draftResult.unwrap();
        if (!draft) return Result.ok(undefined);

        // Liberar todos los holds
        const allSlotIds = draft.items.flatMap((i) => i.slotIds.map((id) => SlotId(id as any)));
        if (allSlotIds.length > 0) {
            await this.slotRepo.releaseHoldsAtomic(allSlotIds, userId);
        }

        return this.repo.deleteDraft(userId);
    }

    async renewHolds(userId: string): Promise<Result<{ renewedUntil: Date; count: number }>> {
        const draftResult = await this.repo.findByUserId(userId);
        if (draftResult.isFailure) return Result.err(draftResult.unwrapError());
        const draft = draftResult.unwrap();
        if (!draft || draft.items.length === 0) {
            return Result.ok({ renewedUntil: new Date(), count: 0 });
        }

        const allSlotIds = draft.items
            .filter((i) => i.status === 'pending')
            .flatMap((i) => i.slotIds.map((id) => SlotId(id as any)));

        if (allSlotIds.length === 0) return Result.ok({ renewedUntil: new Date(), count: 0 });

        const holdResult = await this.slotRepo.holdManyAtomic(allSlotIds, userId, HOLD_TTL_MINUTES);
        if (holdResult.isFailure) return Result.err(holdResult.unwrapError());

        const renewedUntil = new Date(Date.now() + HOLD_TTL_MINUTES * 60_000);
        return Result.ok({ renewedUntil, count: holdResult.unwrap() });
    }
}
