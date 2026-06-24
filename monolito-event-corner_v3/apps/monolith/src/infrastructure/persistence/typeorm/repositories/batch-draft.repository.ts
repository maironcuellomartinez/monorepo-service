// infrastructure/persistence/typeorm/repositories/batch-draft.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchDraftEntity } from '../entities/batch-draft.entity';
import { BatchDraftItemEntity } from '../entities/batch-draft-item.entity';
import { BatchDraftData, BatchDraftItemData } from '../../../../core/services/batch-draft/batch-draft.types';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmBatchDraftRepository {
    constructor(
        @InjectRepository(BatchDraftEntity)
        private readonly drafts: Repository<BatchDraftEntity>,
        @InjectRepository(BatchDraftItemEntity)
        private readonly draftItems: Repository<BatchDraftItemEntity>,
    ) {}

    async findByUserId(userId: string): Promise<Result<BatchDraftData | null>> {
        try {
            const entity = await this.drafts.findOne({
                where: { user_id: userId },
                relations: ['items'],
                order: { items: { created_at: 'ASC' } },
            });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (e) {
            return Result.err(e);
        }
    }

    async getOrCreateDraft(userId: string): Promise<Result<BatchDraftData>> {
        try {
            let entity = await this.drafts.findOne({
                where: { user_id: userId },
                relations: ['items'],
            });
            if (!entity) {
                entity = this.drafts.create({
                    id: crypto.randomUUID(),
                    user_id: userId,
                    items: [],
                });
                await this.drafts.save(entity);
            }
            return Result.ok(this.toDomain(entity));
        } catch (e) {
            return Result.err(e);
        }
    }

    async addItem(draftId: string, item: Omit<BatchDraftItemData, 'id' | 'draftId' | 'createdAt'>): Promise<Result<BatchDraftItemData>> {
        try {
            const entity = this.draftItems.create({
                id: crypto.randomUUID(),
                draft: { id: draftId } as any,
                local_id: item.localId,
                corner_id: item.cornerId,
                corner_name: item.cornerName,
                customer_id: item.customerId,
                customer_name: item.customerName,
                customer_email: item.customerEmail,
                device_serial: item.deviceSerial,
                issue_type_id: item.issueTypeId,
                issue_type_name: item.issueTypeName,
                slot_ids: item.slotIds,
                start_time: item.startTime,
                end_time: item.endTime,
                description: item.description || null,
                notes: item.notes || null,
                status: 'pending',
                last_error: null,
            });
            await this.draftItems.save(entity);
            return Result.ok(this.itemToDomain(entity));
        } catch (e) {
            return Result.err(e);
        }
    }

    async findItemById(itemId: string): Promise<Result<BatchDraftItemData | null>> {
        try {
            const entity = await this.draftItems.findOne({ where: { id: itemId } });
            if (!entity) return Result.ok(null);
            return Result.ok(this.itemToDomain(entity));
        } catch (e) {
            return Result.err(e);
        }
    }

    async findItemByLocalId(draftId: string, localId: string): Promise<Result<BatchDraftItemData | null>> {
        try {
            const entity = await this.draftItems.findOne({ where: { draft: { id: draftId }, local_id: localId } as any });
            if (!entity) return Result.ok(null);
            return Result.ok(this.itemToDomain(entity));
        } catch (e) {
            return Result.err(e);
        }
    }

    async updateItem(itemId: string, updates: Partial<BatchDraftItemData>): Promise<Result<void>> {
        try {
            const patch: Partial<BatchDraftItemEntity> = {};
            if (updates.cornerId !== undefined) patch.corner_id = updates.cornerId;
            if (updates.cornerName !== undefined) patch.corner_name = updates.cornerName;
            if (updates.customerId !== undefined) patch.customer_id = updates.customerId;
            if (updates.customerName !== undefined) patch.customer_name = updates.customerName;
            if (updates.customerEmail !== undefined) patch.customer_email = updates.customerEmail;
            if (updates.deviceSerial !== undefined) patch.device_serial = updates.deviceSerial;
            if (updates.issueTypeId !== undefined) patch.issue_type_id = updates.issueTypeId;
            if (updates.issueTypeName !== undefined) patch.issue_type_name = updates.issueTypeName;
            if (updates.slotIds !== undefined) patch.slot_ids = updates.slotIds;
            if (updates.startTime !== undefined) patch.start_time = updates.startTime;
            if (updates.endTime !== undefined) patch.end_time = updates.endTime;
            if (updates.description !== undefined) patch.description = updates.description || null;
            if (updates.notes !== undefined) patch.notes = updates.notes || null;
            if (updates.status !== undefined) patch.status = updates.status;
            if (updates.lastError !== undefined) patch.last_error = updates.lastError;
            await this.draftItems.update({ id: itemId }, patch);
            return Result.ok(undefined);
        } catch (e) {
            return Result.err(e);
        }
    }

    async removeItem(itemId: string): Promise<Result<void>> {
        try {
            await this.draftItems.delete({ id: itemId });
            return Result.ok(undefined);
        } catch (e) {
            return Result.err(e);
        }
    }

    async deleteDraft(userId: string): Promise<Result<void>> {
        try {
            await this.drafts.delete({ user_id: userId });
            return Result.ok(undefined);
        } catch (e) {
            return Result.err(e);
        }
    }

    async countItems(draftId: string): Promise<number> {
        return this.draftItems.count({ where: { draft: { id: draftId } } as any });
    }

    private toDomain(e: BatchDraftEntity): BatchDraftData {
        return {
            id: e.id,
            userId: e.user_id,
            items: (e.items ?? []).map((i) => this.itemToDomain(i)),
            createdAt: e.created_at,
            updatedAt: e.updated_at,
        };
    }

    private itemToDomain(e: BatchDraftItemEntity): BatchDraftItemData {
        return {
            id: e.id,
            draftId: e.draft_id ?? e.draft?.id,
            localId: e.local_id,
            cornerId: e.corner_id,
            cornerName: e.corner_name,
            customerId: e.customer_id,
            customerName: e.customer_name,
            customerEmail: e.customer_email,
            deviceSerial: e.device_serial,
            issueTypeId: e.issue_type_id,
            issueTypeName: e.issue_type_name,
            slotIds: e.slot_ids,
            startTime: e.start_time,
            endTime: e.end_time,
            description: e.description ?? '',
            notes: e.notes ?? '',
            status: e.status,
            lastError: e.last_error,
            createdAt: e.created_at,
        };
    }
}
