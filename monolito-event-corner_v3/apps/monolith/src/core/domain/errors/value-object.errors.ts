// core/domain/errors/value-object.errors.ts
import { DomainError } from './domain-error';

export class InvalidEmailError extends DomainError {
    readonly code = 'INVALID_EMAIL';
    constructor(email: string, reason: string) {
        super(`Invalid email "${email}": ${reason}`);
    }
}

export class InvalidSerialNumberError extends DomainError {
    readonly code = 'INVALID_SERIAL_NUMBER';
    constructor(value: string, reason: string) {
        super(`Invalid serial number "${value}": ${reason}`);
    }
}

export class InvalidDateRangeError extends DomainError {
    readonly code = 'INVALID_DATE_RANGE';
    constructor(reason: string) {
        super(`Invalid date range: ${reason}`);
    }
}

export class InvalidTechnicianAvailabilityError extends DomainError {
    readonly code = 'INVALID_TECHNICIAN_AVAILABILITY';
    constructor(reason: string) {
        super(`Invalid technician availability: ${reason}`);
    }
}

export class InvalidSlotWindowError extends DomainError {
    readonly code = 'INVALID_SLOT_WINDOW';
    constructor(reason: string) {
        super(`Invalid slot window: ${reason}`);
    }
}