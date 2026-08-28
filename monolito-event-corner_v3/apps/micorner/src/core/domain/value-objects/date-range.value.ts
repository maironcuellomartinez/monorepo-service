import { Result } from "@app/result";
import { InvalidDateRangeError } from "../errors/value-object.errors";

/**
 * Clase que representa un rango de fechas inmutable
 */
export class DateRange {
    private readonly _start: Date;
    private readonly _end: Date;

    private constructor(start: Date, end: Date) {
        this._start = new Date(start);
        this._end = new Date(end);
    }

    get start(): Date {
        return new Date(this._start);
    }

    get end(): Date {
        return new Date(this._end);
    }

    private static isValidDate(date: unknown): date is Date {
        return date instanceof Date && !isNaN(date.getTime());
    }

    /**
     * Crea un rango de fechas con validación completa
     * @param start - Fecha de inicio
     * @param end - Fecha de fin
     * @returns Resultado con el rango de fechas creado o un error
     */
    static create(start: unknown, end: unknown): Result<DateRange, InvalidDateRangeError> {
        if (!this.isValidDate(start)) {
            return Result.err(new InvalidDateRangeError('Start must be a valid Date'));
        }

        if (!this.isValidDate(end)) {
            return Result.err(new InvalidDateRangeError('End must be a valid Date'));
        }

        if (start >= end) {
            return Result.err(new InvalidDateRangeError('Start date must be before end date'));
        }

        return Result.ok(new DateRange(start, end));
    }

    /**
     * Reconstruye un DateRange desde persistencia (sin validaciones estrictas)
     */
    static reconstitute(start: Date, end: Date): DateRange {
        return new DateRange(start, end);
    }

    isInPast(): boolean {
        return this._end < new Date();
    }

    isInFuture(): boolean {
        return this._start > new Date();
    }

    overlapsWith(other: DateRange): boolean {
        return this._start < other.end && this._end > other.start;
    }

    contains(date: Date): boolean {
        return date >= this._start && date <= this._end;
    }

    containsRange(other: DateRange): boolean {
        return this._start <= other.start && this._end >= other.end;
    }

    getDurationMs(): number {
        return this._end.getTime() - this._start.getTime();
    }

    getDurationMinutes(): number {
        return this.getDurationMs() / (1000 * 60);
    }

    getDurationHours(): number {
        return this.getDurationMs() / (1000 * 60 * 60);
    }

    toISOString(): { start: string; end: string } {
        return {
            start: this._start.toISOString(),
            end: this._end.toISOString()
        };
    }

    equals(other: DateRange): boolean {
        return this._start.getTime() === other.start.getTime() &&
            this._end.getTime() === other.end.getTime();
    }

    toString(): string {
        return `${this._start.toISOString()} - ${this._end.toISOString()}`;
    }
    toJSON() { return { start: this._start, end: this._end }; }
}