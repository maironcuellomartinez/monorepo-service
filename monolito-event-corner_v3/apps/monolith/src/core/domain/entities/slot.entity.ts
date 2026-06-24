// core/domain/entities/slot.entity.ts
import { SlotId, CornerId, ScheduleId } from '../value-objects/ids';
import { DateRange } from '../value-objects/date-range.value';
import { Result } from '@app/result';
import { SlotStatus } from '../enums/slot-status.enum';

export interface SlotProps {
    id: SlotId;
    cornerId: CornerId;
    scheduleId: ScheduleId;
    timeRange: DateRange;
    status: SlotStatus;
    heldByUserId: string | null;
    heldUntil: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export class Slot {
    private constructor(private props: SlotProps) { }

    // Getters
    get id(): SlotId { return this.props.id; }
    get cornerId(): CornerId { return this.props.cornerId; }
    get scheduleId(): ScheduleId { return this.props.scheduleId; }
    get timeRange(): DateRange { return this.props.timeRange; }
    get status(): SlotStatus { return this.props.status; }
    get heldByUserId(): string | null { return this.props.heldByUserId; }
    get heldUntil(): Date | null { return this.props.heldUntil; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    // Métodos de negocio
    isAvailable(): boolean {
        return this.props.status === SlotStatus.AVAILABLE &&
            this.props.timeRange.start > new Date();
    }

    isBooked(): boolean {
        return this.props.status === SlotStatus.BOOKED;
    }

    isExpired(): boolean {
        return this.props.status === SlotStatus.EXPIRED ||
            this.props.timeRange.end < new Date();
    }

    isHeldBy(userId: string): boolean {
        return this.props.status === SlotStatus.HELD &&
            this.props.heldByUserId === userId;
    }

    isHoldExpired(): boolean {
        if (this.props.status !== SlotStatus.HELD) return false;
        return !this.props.heldUntil || this.props.heldUntil < new Date();
    }

    /** true si el slot puede ser tomado por el usuario dado (AVAILABLE, o HELD por él, o hold expirado) */
    isAvailableForUser(userId?: string): boolean {
        if (this.isExpired()) return false;
        if (this.props.status === SlotStatus.AVAILABLE) return true;
        if (userId && this.isHeldBy(userId)) return true;
        if (this.props.status === SlotStatus.HELD && this.isHoldExpired()) return true;
        return false;
    }

    canBeBooked(): boolean {
        return this.isAvailable() && !this.isExpired();
    }

    book(): Result<void> {
        if (!this.canBeBooked()) {
            return Result.err(new Error('Slot cannot be booked'));
        }
        this.props.status = SlotStatus.BOOKED;
        this.props.heldByUserId = null;
        this.props.heldUntil = null;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    release(): Result<void> {
        if (this.props.status !== SlotStatus.BOOKED) {
            return Result.err(new Error('Only booked slots can be released'));
        }
        this.props.status = SlotStatus.AVAILABLE;
        this.props.heldByUserId = null;
        this.props.heldUntil = null;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    expire(): void {
        this.props.status = SlotStatus.EXPIRED;
        this.props.heldByUserId = null;
        this.props.heldUntil = null;
        this.props.updatedAt = new Date();
    }

    hold(userId: string, ttlMinutes: number): Result<void> {
        if (this.props.status !== SlotStatus.AVAILABLE && !this.isHoldExpired()) {
            return Result.err(new Error('Slot is not available for hold'));
        }
        this.props.status = SlotStatus.HELD;
        this.props.heldByUserId = userId;
        this.props.heldUntil = new Date(Date.now() + ttlMinutes * 60_000);
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    releaseHold(userId: string): Result<void> {
        if (this.props.status !== SlotStatus.HELD || this.props.heldByUserId !== userId) {
            return Result.err(new Error('Slot is not held by this user'));
        }
        this.props.status = SlotStatus.AVAILABLE;
        this.props.heldByUserId = null;
        this.props.heldUntil = null;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    // Verifica si este slot está dentro de un rango de tiempo
    isWithinRange(range: DateRange): boolean {
        return this.props.timeRange.start >= range.start &&
            this.props.timeRange.end <= range.end;
    }

    // Verifica si este slot se solapa con otro rango
    overlapsWith(range: DateRange): boolean {
        return this.props.timeRange.overlapsWith(range);
    }

    toJSON() { return { ...this.props }; }

    // Factory method
    static create(
        id: SlotId,
        cornerId: CornerId,
        scheduleId: ScheduleId,
        timeRange: DateRange,
    ): Result<Slot> {
        const now = new Date();
        if (timeRange.end <= now) {
            return Result.err(new Error('Slot time range is in the past'));
        }
        const slot = new Slot({
            id,
            cornerId,
            scheduleId,
            timeRange,
            status: SlotStatus.AVAILABLE,
            heldByUserId: null,
            heldUntil: null,
            createdAt: now,
            updatedAt: now,
        });

        return Result.ok(slot);
    }

    // Reconstruir desde persistencia
    static reconstitute(
        id: SlotId,
        cornerId: CornerId,
        scheduleId: ScheduleId,
        timeRange: DateRange,
        status: SlotStatus,
        createdAt: Date,
        updatedAt: Date,
        heldByUserId: string | null = null,
        heldUntil: Date | null = null,
    ): Slot {
        return new Slot({
            id,
            cornerId,
            scheduleId,
            timeRange,
            status,
            heldByUserId,
            heldUntil,
            createdAt,
            updatedAt,
        });
    }
}
