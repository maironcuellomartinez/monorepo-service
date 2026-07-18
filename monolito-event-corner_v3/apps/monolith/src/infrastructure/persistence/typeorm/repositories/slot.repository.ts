// infrastructure/persistence/typeorm/repositories/slot.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, LessThan } from 'typeorm';
import {
  ISlotRepository,
  SlotFilters,
} from '../../../../core/ports/outgoing/repositories/slot-repository.port';
import { CornerSlotEntity } from '../entities/corner-slot.entity';
import { Slot } from '../../../../core/domain/entities/slot.entity';
import { DateRange } from '../../../../core/domain/value-objects/date-range.value';
import { Result } from '@app/result';
import { SlotStatus } from '@app/core/domain/enums/slot-status.enum';
import { CornerId, ScheduleId, SlotId } from '@app/shared/types/branded-ids';

@Injectable()
export class TypeOrmSlotRepository implements ISlotRepository {
  constructor(
    @InjectRepository(CornerSlotEntity)
    private readonly repo: Repository<CornerSlotEntity>,
  ) {}

  async save(slot: Slot): Promise<Result<void>> {
    try {
      const entity = this.toEntity(slot);
      await this.repo.save(entity);
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async saveMany(slots: Slot[]): Promise<Result<void>> {
    if (slots.length === 0) return Result.ok(undefined);
    try {
      const entities = slots.map((s) => this.toEntity(s));
      // Una sola query por chunk en lugar de N inserts individuales.
      // orIgnore (INSERT IGNORE): las ventanas que ya existen para el corner
      // (uq_corner_slot_window) se saltan en vez de abortar el lote — hace
      // idempotente la generación de slots ante schedules solapados o
      // regeneraciones repetidas.
      const CHUNK = 500;
      for (let i = 0; i < entities.length; i += CHUNK) {
        await this.repo
          .createQueryBuilder()
          .insert()
          .values(entities.slice(i, i + CHUNK))
          .orIgnore()
          .execute();
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findById(id: SlotId): Promise<Result<Slot | null>> {
    try {
      const entity = await this.repo.findOne({
        where: { slot_id: id.toString() },
      });
      if (!entity) return Result.ok(null);
      const domain = this.toDomain(entity);
      return Result.ok(domain);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findManyByIds(ids: SlotId[]): Promise<Result<Slot[]>> {
    try {
      const entities = await this.repo.find({
        where: { slot_id: In(ids.map((id) => id.toString())) },
        order: { starts_at: 'ASC' },
      });
      return Result.ok(entities.map((e) => this.toDomain(e)));
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByCornerAndDateRange(
    cornerId: CornerId,
    dateRange: DateRange,
  ): Promise<Result<Slot[]>> {
    try {
      const entities = await this.repo.find({
        where: {
          corner_id: cornerId,
          starts_at: Between(dateRange.start, dateRange.end),
        },
        order: { starts_at: 'ASC' },
      });
      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findAvailableByCornerAndDateRange(
    cornerId: CornerId,
    dateRange: DateRange,
  ): Promise<Result<Slot[]>> {
    try {
      const entities = await this.repo.find({
        where: {
          corner_id: cornerId,
          starts_at: Between(dateRange.start, dateRange.end),
          status: SlotStatus.AVAILABLE,
        },
        order: { starts_at: 'ASC' },
      });
      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findWithFilters(filters: SlotFilters): Promise<Result<Slot[]>> {
    try {
      const queryBuilder = this.repo
        .createQueryBuilder('slot')
        .where('slot.corner_id = :cornerId', { cornerId: filters.cornerId })
        .andWhere('slot.starts_at >= :fromDate', { fromDate: filters.fromDate })
        .andWhere('slot.ends_at <= :toDate', { toDate: filters.toDate });

      if (filters.status && filters.status.length > 0) {
        queryBuilder.andWhere('slot.status IN (:...status)', {
          status: filters.status,
        });
      }

      queryBuilder.orderBy('slot.starts_at', 'ASC');

      const entities = await queryBuilder.getMany();
      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async update(slot: Slot): Promise<Result<void>> {
    try {
      const entity = this.toEntity(slot);
      await this.repo.update(
        { slot_id: entity.slot_id },
        {
          status: entity.status,
          held_by_user_id: entity.held_by_user_id,
          held_until: entity.held_until,
          updated_at: entity.updated_at,
        },
      );
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async updateMany(slots: Slot[]): Promise<Result<void>> {
    try {
      for (const slot of slots) {
        await this.update(slot);
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error);
    }
  }

  async markAsExpired(beforeDate: Date): Promise<Result<number>> {
    try {
      const result = await this.repo.update(
        {
          ends_at: LessThan(beforeDate),
          status: SlotStatus.AVAILABLE,
        },
        {
          status: SlotStatus.EXPIRED,
          updated_at: new Date(),
        },
      );

      return Result.ok(result.affected || 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findConsecutiveSlots(
    cornerId: string,
    startTime: Date,
    durationMinutes: number,
  ): Promise<Result<Slot[]>> {
    try {
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

      const slots = await this.repo.find({
        where: {
          corner_id: cornerId,
          starts_at: Between(startTime, endTime),
          status: SlotStatus.AVAILABLE,
        },
        order: { starts_at: 'ASC' },
      });

      // Verificar que los slots son consecutivos
      if (slots.length === 0) return Result.ok([]);

      let expectedStart = new Date(startTime);
      const consecutiveSlots: CornerSlotEntity[] = [];

      for (const slot of slots) {
        if (slot.starts_at.getTime() !== expectedStart.getTime()) {
          break;
        }
        consecutiveSlots.push(slot);
        expectedStart = new Date(slot.ends_at);
      }

      // Verificar que cubren la duración completa
      if (
        consecutiveSlots.length === 0 ||
        consecutiveSlots[consecutiveSlots.length - 1].ends_at.getTime() <
          endTime.getTime()
      ) {
        return Result.ok([]);
      }

      const domains = consecutiveSlots.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async findByCornerAndDate(
    cornerId: string,
    date: Date,
  ): Promise<Result<Slot[]>> {
    try {
      // Usar setUTCHours para evitar desfase cuando el servidor corre en timezone != UTC
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const entities = await this.repo.find({
        where: {
          corner_id: cornerId,
          starts_at: Between(startOfDay, endOfDay),
        },
        order: { starts_at: 'ASC' },
      });

      const domains = entities.map((e) => this.toDomain(e));
      return Result.ok(domains);
    } catch (error) {
      return Result.err(error);
    }
  }

  async hasSlotsBySchedule(scheduleId: string): Promise<Result<boolean>> {
    try {
      const count = await this.repo.count({
        where: { schedule_id: scheduleId },
      });
      return Result.ok(count > 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async hasBookedSlotsBySchedule(scheduleId: string): Promise<Result<boolean>> {
    try {
      const count = await this.repo.count({
        where: { schedule_id: scheduleId, status: SlotStatus.BOOKED },
      });
      return Result.ok(count > 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async deleteUnusedBySchedule(scheduleId: string): Promise<Result<number>> {
    try {
      // Las incidencias canceladas conservan filas en incident_slots que apuntan
      // a slots ya liberados (AVAILABLE/EXPIRED); la FK impediria borrarlos al
      // regenerar el horario. Solo incidencias canceladas pueden referenciar
      // slots no-BOOKED (activas y cerradas los mantienen BOOKED), y una
      // cancelada no necesita el vinculo: su scheduledRange queda en la
      // propia incidencia.
      await this.repo.query(
        `DELETE isl FROM incident_slots isl
         INNER JOIN corner_slots cs ON cs.slot_id = isl.slot_id
         WHERE cs.schedule_id = ? AND cs.status != ?`,
        [scheduleId, SlotStatus.BOOKED],
      );
      const result = await this.repo
        .createQueryBuilder()
        .delete()
        .where('schedule_id = :scheduleId', { scheduleId })
        .andWhere('status != :booked', { booked: SlotStatus.BOOKED })
        .execute();
      return Result.ok(result.affected ?? 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async bookManyAtomic(
    slotIds: SlotId[],
    userId?: string,
  ): Promise<Result<number>> {
    try {
      const ids = slotIds.map((id) => id.toString());
      const now = new Date();
      const qb = this.repo.createQueryBuilder().update().set({
        status: SlotStatus.BOOKED,
        held_by_user_id: null,
        held_until: null,
        updated_at: now,
      });

      if (userId) {
        qb.where(
          'slot_id IN (:...ids) AND (status = :available OR (status = :held AND (held_by_user_id = :userId OR held_until < :now)))',
          {
            ids,
            available: SlotStatus.AVAILABLE,
            held: SlotStatus.HELD,
            userId,
            now,
          },
        );
      } else {
        qb.where('slot_id IN (:...ids) AND status = :available', {
          ids,
          available: SlotStatus.AVAILABLE,
        });
      }

      const result = await qb.execute();
      return Result.ok(result.affected ?? 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async holdManyAtomic(
    slotIds: SlotId[],
    userId: string,
    ttlMinutes: number,
  ): Promise<Result<number>> {
    try {
      const ids = slotIds.map((id) => id.toString());
      const now = new Date();
      const heldUntil = new Date(now.getTime() + ttlMinutes * 60_000);
      const result = await this.repo
        .createQueryBuilder()
        .update()
        .set({
          status: SlotStatus.HELD,
          held_by_user_id: userId,
          held_until: heldUntil,
          updated_at: now,
        })
        .where(
          'slot_id IN (:...ids) AND (status = :available OR (status = :held AND held_until < :now))',
          { ids, available: SlotStatus.AVAILABLE, held: SlotStatus.HELD, now },
        )
        .execute();
      return Result.ok(result.affected ?? 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async releaseHoldsAtomic(
    slotIds: SlotId[],
    userId: string,
  ): Promise<Result<number>> {
    try {
      const ids = slotIds.map((id) => id.toString());
      const result = await this.repo
        .createQueryBuilder()
        .update()
        .set({
          status: SlotStatus.AVAILABLE,
          held_by_user_id: null,
          held_until: null,
          updated_at: new Date(),
        })
        .where(
          'slot_id IN (:...ids) AND status = :held AND held_by_user_id = :userId',
          { ids, held: SlotStatus.HELD, userId },
        )
        .execute();
      return Result.ok(result.affected ?? 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async convertHoldsToBooked(
    slotIds: SlotId[],
    userId: string,
  ): Promise<Result<number>> {
    try {
      const ids = slotIds.map((id) => id.toString());
      const result = await this.repo
        .createQueryBuilder()
        .update()
        .set({
          status: SlotStatus.BOOKED,
          held_by_user_id: null,
          held_until: null,
          updated_at: new Date(),
        })
        .where(
          'slot_id IN (:...ids) AND status = :held AND held_by_user_id = :userId',
          { ids, held: SlotStatus.HELD, userId },
        )
        .execute();
      return Result.ok(result.affected ?? 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  async releaseExpiredHolds(olderThanHours = 1): Promise<Result<number>> {
    try {
      const threshold = new Date(Date.now() - olderThanHours * 3_600_000);
      const result = await this.repo
        .createQueryBuilder()
        .update()
        .set({
          status: SlotStatus.AVAILABLE,
          held_by_user_id: null,
          held_until: null,
          updated_at: new Date(),
        })
        .where('status = :held AND held_until < :threshold', {
          held: SlotStatus.HELD,
          threshold,
        })
        .execute();
      return Result.ok(result.affected ?? 0);
    } catch (error) {
      return Result.err(error);
    }
  }

  private toEntity(domain: Slot): CornerSlotEntity {
    const entity = new CornerSlotEntity();
    entity.slot_id = domain.id.toString();
    entity.corner_id = domain.cornerId.toString();
    entity.schedule_id = domain.scheduleId.toString();
    entity.starts_at = domain.timeRange.start;
    entity.ends_at = domain.timeRange.end;
    entity.status = domain.status;
    entity.held_by_user_id = domain.heldByUserId;
    entity.held_until = domain.heldUntil;
    entity.created_at = domain.createdAt;
    entity.updated_at = domain.updatedAt;
    return entity;
  }

  private toDomain(entity: CornerSlotEntity): Slot {
    const dateRange = DateRange.reconstitute(entity.starts_at, entity.ends_at);

    return Slot.reconstitute(
      SlotId(entity.slot_id),
      CornerId(entity.corner_id),
      ScheduleId(entity.schedule_id),
      dateRange,
      entity.status as SlotStatus,
      entity.created_at,
      entity.updated_at,
      entity.held_by_user_id ?? null,
      entity.held_until ?? null,
    );
  }
}
