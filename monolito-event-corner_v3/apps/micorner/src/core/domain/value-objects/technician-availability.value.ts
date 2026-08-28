// core/domain/value-objects/technician-availability.value.ts
import { Result } from "@app/result";
import { TechnicianId } from './ids';
import { DateRange } from './date-range.value';
import { InvalidTechnicianAvailabilityError } from "../errors/value-object.errors";

export interface TechnicianAvailabilityData {
    technicianId: TechnicianId;
    name: string;
    available: boolean;
    occupiedUntil?: Date;
    currentIncidentId?: string;
}

export class TechnicianAvailability {
    private constructor(
        private readonly _technicianId: TechnicianId,
        private readonly _name: string,
        private readonly _available: boolean,
        private readonly _occupiedUntil?: Date,
        private readonly _currentIncidentId?: string
    ) { }

    get technicianId(): TechnicianId {
        return this._technicianId;
    }

    get name(): string {
        return this._name;
    }

    get available(): boolean {
        return this._available;
    }

    get occupiedUntil(): Date | undefined {
        return this._occupiedUntil ? new Date(this._occupiedUntil) : undefined;
    }

    get currentIncidentId(): string | undefined {
        return this._currentIncidentId;
    }

    private static isValidDate(date: unknown): date is Date {
        return date instanceof Date && !isNaN(date.getTime());
    }

    static createAvailable(
        technicianId: TechnicianId,
        name: string
    ): Result<TechnicianAvailability, InvalidTechnicianAvailabilityError> {
        const nameError = this.validateName(name);
        if (nameError) return Result.err(nameError);

        return Result.ok(new TechnicianAvailability(technicianId, name.trim(), true));
    }

    static createOccupied(
        technicianId: TechnicianId,
        name: string,
        occupiedUntil: Date,
        currentIncidentId?: string
    ): Result<TechnicianAvailability, InvalidTechnicianAvailabilityError> {
        const nameError = this.validateName(name);
        if (nameError) return Result.err(nameError);

        if (!this.isValidDate(occupiedUntil)) {
            return Result.err(new InvalidTechnicianAvailabilityError('occupiedUntil must be a valid Date'));
        }

        // Si está ocupado, occupiedUntil debe ser en el futuro
        if (occupiedUntil <= new Date()) {
            return Result.err(new InvalidTechnicianAvailabilityError('occupiedUntil must be in the future for an occupied technician'));
        }

        return Result.ok(new TechnicianAvailability(
            technicianId,
            name.trim(),
            false,
            occupiedUntil,
            currentIncidentId
        ));
    }

    private static validateName(name: string): InvalidTechnicianAvailabilityError | null {
        if (!name || typeof name !== 'string') {
            return new InvalidTechnicianAvailabilityError('Name is required');
        }

        if (name.trim().length === 0) {
            return new InvalidTechnicianAvailabilityError('Name cannot be empty');
        }

        if (name.trim().length > 100) {
            return new InvalidTechnicianAvailabilityError('Name cannot exceed 100 characters');
        }

        return null;
    }

    static reconstitute(data: TechnicianAvailabilityData): TechnicianAvailability {
        return new TechnicianAvailability(
            data.technicianId,
            data.name,
            data.available,
            data.occupiedUntil,
            data.currentIncidentId
        );
    }

    isAvailableForWindow(window: DateRange): boolean {
        if (this._available) return true;
        if (!this._occupiedUntil) return false;
        return this._occupiedUntil <= window.start;
    }

    canTakeIncident(): boolean {
        return this._available || (this._occupiedUntil !== undefined && this._occupiedUntil <= new Date());
    }

    equals(other: TechnicianAvailability): boolean {
        return this._technicianId === other._technicianId &&
            this._available === other._available &&
            this._name === other._name;
    }
}