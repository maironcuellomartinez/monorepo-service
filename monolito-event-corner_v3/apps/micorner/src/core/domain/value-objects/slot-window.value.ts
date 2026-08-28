// core/domain/value-objects/slot-window.value.ts
import { Result } from "@app/result";
import { DateRange } from "./date-range.value";
import { InvalidSlotWindowError } from "../errors/value-object.errors";

export const SLOT_CONSTANTS = {
    MIN_DURATION: 5,    // 5 minutos mínimo
    MAX_DURATION: 480,  // 8 horas máximo
    DEFAULT_DURATION: 15 // 15 minutos por defecto
} as const;

/**
 * Representa una ventana de tiempo compuesta por slots consecutivos
 * con la misma duración. Usado para representar la disponibilidad
 * de tiempo en un corner.
 */
export class SlotWindow {
    private readonly _slots: DateRange[];
    private readonly _windowRange: DateRange;

    private constructor(slots: DateRange[], windowRange: DateRange) {
        this._slots = slots;
        this._windowRange = windowRange;
    }

    get slots(): DateRange[] {
        return [...this._slots];
    }

    get windowRange(): DateRange {
        return this._windowRange;
    }

    get start(): Date {
        return this._windowRange.start;
    }

    get end(): Date {
        return this._windowRange.end;
    }

    /**
     * Crea una ventana de slots validando:
     * - Al menos un slot
     * - Todos los slots con la misma duración
     * - Slots consecutivos (sin gaps)
     * - Duración dentro de límites
     */
    static create(slots: DateRange[]): Result<SlotWindow, InvalidSlotWindowError> {
        if (!slots || slots.length === 0) {
            return Result.err(new InvalidSlotWindowError('Slot window must have at least one slot'));
        }

        // Verificar que todos los slots tienen la misma duración
        const firstDuration = slots[0].getDurationMinutes();
        for (let i = 1; i < slots.length; i++) {
            const diff = Math.abs(slots[i].getDurationMinutes() - firstDuration);
            if (diff > 0.001) {
                return Result.err(new InvalidSlotWindowError('All slots must have the same duration'));
            }
        }

        // Verificar que la duración está dentro de límites
        if (firstDuration < SLOT_CONSTANTS.MIN_DURATION) {
            return Result.err(new InvalidSlotWindowError(`Slot duration must be at least ${SLOT_CONSTANTS.MIN_DURATION} minutes`));
        }

        if (firstDuration > SLOT_CONSTANTS.MAX_DURATION) {
            return Result.err(new InvalidSlotWindowError(`Slot duration cannot exceed ${SLOT_CONSTANTS.MAX_DURATION} minutes`));
        }

        // Verificar que son consecutivos
        for (let i = 0; i < slots.length - 1; i++) {
            if (slots[i].end.getTime() !== slots[i + 1].start.getTime()) {
                return Result.err(new InvalidSlotWindowError('Slots must be consecutive without gaps'));
            }
        }

        const windowRange = DateRange.reconstitute(
            slots[0].start,
            slots[slots.length - 1].end
        );

        return Result.ok(new SlotWindow([...slots], windowRange));
    }

    /**
     * Reconstruye una SlotWindow desde persistencia
     */
    static reconstitute(slots: DateRange[]): SlotWindow {
        const windowRange = DateRange.reconstitute(
            slots[0].start,
            slots[slots.length - 1].end
        );
        return new SlotWindow([...slots], windowRange);
    }

    getSlotCount(): number {
        return this._slots.length;
    }

    getDurationMinutes(): number {
        return this._windowRange.getDurationMinutes();
    }

    getSlotDurationMinutes(): number {
        return this._slots[0]?.getDurationMinutes() ?? 0;
    }

    containsSlot(slot: DateRange): boolean {
        return this._slots.some(s => s.equals(slot));
    }

    getSlotAt(index: number): DateRange | undefined {
        return index >= 0 && index < this._slots.length
            ? this._slots[index]
            : undefined;
    }

    overlapsWith(other: SlotWindow): boolean {
        return this._windowRange.overlapsWith(other._windowRange);
    }

    contains(date: Date): boolean {
        return this._windowRange.contains(date);
    }

    isExpired(): boolean {
        return this._windowRange.isInPast();
    }

    equals(other: SlotWindow): boolean {
        if (this._slots.length !== other._slots.length) return false;
        return this._slots.every((slot, index) => slot.equals(other._slots[index]));
    }

    toString(): string {
        return `SlotWindow(${this.getSlotCount()} slots, ${this.getDurationMinutes()}min, ${this.start.toISOString()} - ${this.end.toISOString()})`;
    }
}