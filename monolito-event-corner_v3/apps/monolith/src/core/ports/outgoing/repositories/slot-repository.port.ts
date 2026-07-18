import { DateRange } from '../../../domain/value-objects/date-range.value';
import { SLOT_REPOSITORY } from './tokens';
import { Result } from '@app/result';
import { Slot } from '@app/core/domain/entities/slot.entity';
import { SlotId } from '@app/shared/types/branded-ids';

export interface SlotFilters {
  cornerId: string;
  fromDate: Date;
  toDate: Date;
  status?: string[];
}

export interface ISlotRepository {
  save(slot: Slot): Promise<Result<void>>;
  saveMany(slots: Slot[]): Promise<Result<void>>;
  findById(id: SlotId): Promise<Result<Slot | null>>;
  findManyByIds(ids: SlotId[]): Promise<Result<Slot[]>>;
  findByCornerAndDateRange(
    cornerId: string,
    dateRange: DateRange,
  ): Promise<Result<Slot[]>>;
  findAvailableByCornerAndDateRange(
    cornerId: string,
    dateRange: DateRange,
  ): Promise<Result<Slot[]>>;
  findWithFilters(filters: SlotFilters): Promise<Result<Slot[]>>;
  update(slot: Slot): Promise<Result<void>>;
  updateMany(slots: Slot[]): Promise<Result<void>>;
  markAsExpired(beforeDate: Date): Promise<Result<number>>;
  findConsecutiveSlots(
    cornerId: string,
    startTime: Date,
    durationMinutes: number,
  ): Promise<Result<Slot[]>>;
  findByCornerAndDate(cornerId: string, date: Date): Promise<Result<Slot[]>>;
  hasSlotsBySchedule(scheduleId: string): Promise<Result<boolean>>;
  /** true si el schedule tiene algún slot con status BOOKED (ya usado en una incidencia) */
  hasBookedSlotsBySchedule(scheduleId: string): Promise<Result<boolean>>;
  /** Elimina todos los slots de un schedule que no estén en status BOOKED */
  deleteUnusedBySchedule(scheduleId: string): Promise<Result<number>>;
  /**
   * Marca los slots como BOOKED de forma atómica usando un UPDATE condicional.
   * - Sin userId: solo acepta slots AVAILABLE.
   * - Con userId: además convierte slots HELD por ese usuario (y holds expirados).
   * Devuelve el número de filas afectadas.
   */
  bookManyAtomic(slotIds: SlotId[], userId?: string): Promise<Result<number>>;

  /**
   * Reserva slots de forma atómica (AVAILABLE → HELD).
   * También reclama holds expirados de otros usuarios.
   * Devuelve el número de filas efectivamente holdeadas.
   */
  holdManyAtomic(
    slotIds: SlotId[],
    userId: string,
    ttlMinutes: number,
  ): Promise<Result<number>>;

  /**
   * Libera los holds del usuario sobre los slots indicados (HELD → AVAILABLE).
   * Solo afecta filas donde held_by_user_id = userId.
   */
  releaseHoldsAtomic(
    slotIds: SlotId[],
    userId: string,
  ): Promise<Result<number>>;

  /**
   * Convierte los holds del usuario directamente a BOOKED (HELD → BOOKED).
   * Solo afecta filas donde held_by_user_id = userId AND status = 'HELD'.
   */
  convertHoldsToBooked(
    slotIds: SlotId[],
    userId: string,
  ): Promise<Result<number>>;

  /**
   * Extiende held_until de los holds del usuario (HELD propios, vigentes o
   * vencidos) y re-reclama slots que hayan vuelto a AVAILABLE. A diferencia
   * de holdManyAtomic, SÍ afecta holds propios todavía activos — es la
   * operación de renovación periódica del lote.
   */
  renewHoldsAtomic(
    slotIds: SlotId[],
    userId: string,
    ttlMinutes: number,
  ): Promise<Result<number>>;

  /**
   * Limpieza periódica: resetea a AVAILABLE los slots HELD cuyo held_until
   * ha expirado hace más de threshold horas. Para el cron diario de F2.9.
   */
  releaseExpiredHolds(olderThanHours?: number): Promise<Result<number>>;
}

export { SLOT_REPOSITORY };
