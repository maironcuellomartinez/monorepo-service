import { DomainError } from "../types/incident-types"
import { Result } from "@app/result"

export class DateRange {
    public readonly start: Date
    public readonly end: Date

    private constructor(start: Date, end: Date) {
        this.start = start
        this.end = end
    }

    static create(start: Date | null | undefined, end: Date | null | undefined): Result<DateRange, DomainError> {
        // Validar que no sean null/undefined
        if (!start || !end) {
            return Result.err(new DomainError('Start and end dates are required'))
        }

        // Validar que sean objetos Date válidos
        if (!(start instanceof Date) || isNaN(start.getTime())) {
            return Result.err(new DomainError('Start date must be a valid Date object'))
        }

        if (!(end instanceof Date) || isNaN(end.getTime())) {
            return Result.err(new DomainError('End date must be a valid Date object'))
        }

        // Validar que start sea anterior a end
        if (start >= end) {
            return Result.err(new DomainError('Start date must be before end date'))
        }

        return Result.ok(new DateRange(new Date(start), new Date(end)))
    }

    /**
     * Reconstruye un DateRange desde persistencia (sin validaciones estrictas)
     */
    static from(start: Date, end: Date): DateRange {
        return new DateRange(start, end)
    }

    overlapsWith(other: DateRange): boolean {
        return this.start < other.end && this.end > other.start
    }

    contains(date: Date): boolean {
        return date >= this.start && date <= this.end
    }

    /**
     * Duración en milisegundos
     */
    get duration(): number {
        return this.end.getTime() - this.start.getTime()
    }

    /**
     * Verifica si otro rango está completamente contenido dentro de este
     */
    containsRange(other: DateRange): boolean {
        return this.start <= other.start && this.end >= other.end
    }
}