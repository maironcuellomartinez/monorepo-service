// shared/errors/domain-error.ts
export abstract class DomainError extends Error {
    abstract readonly code: string;
    abstract readonly message: string;
    readonly timestamp: Date;

    constructor(message?: string) {
        super(message);
        this.timestamp = new Date();
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

// core/domain/errors/incident.errors.ts
export class IncidentNotAvailableError extends DomainError {
    readonly code = 'INCIDENT_NOT_AVAILABLE';
    readonly message = 'The incident is not available to be taken';
}

export class IncidentAlreadyTakenError extends DomainError {
    readonly code = 'INCIDENT_ALREADY_TAKEN';
    readonly message = 'The incident has already been taken by another technician';
}

export class TechnicianNotAuthorizedError extends DomainError {
    readonly code = 'TECHNICIAN_NOT_AUTHORIZED';
    readonly message = 'The technician is not authorized to perform this action';
}

export class SlotNotAvailableError extends DomainError {
    readonly code = 'SLOT_NOT_AVAILABLE';
    readonly message = 'The requested slot is not available';
}

export class InvalidDateRangeError extends DomainError {
    readonly code = 'INVALID_DATE_RANGE';
    readonly message: string;
    constructor(start: Date, end: Date) {
        super(`Invalid date range: ${start} must be before ${end}`);
        this.message = `Invalid date range: ${start} must be before ${end}`;
    }
}

export class InsufficientSlotsError extends DomainError {
    readonly code = 'INSUFFICIENT_SLOTS';
    readonly message = 'Not enough consecutive slots available for the requested duration';
}

export class IssueTypeNotFoundError extends DomainError {
    readonly code = 'ISSUE_TYPE_NOT_FOUND';
    readonly message: string;

    constructor(id: string) {
        super(`Issue type ${id} not found`);
        this.message = `Issue type ${id} not found`;
    }
}

export class ServiceNowProfileNotFoundError extends DomainError {
    readonly code = 'SERVICENOW_PROFILE_NOT_FOUND';
    readonly message: string;

    constructor(id: string) {
        super(`ServiceNow profile ${id} not found`);
        this.message = `ServiceNow profile ${id} not found`;
    }
}

export class IssueTypeTreeNotFoundError extends DomainError {
    readonly code = 'ISSUE_TYPE_TREE_NOT_FOUND';
    readonly message: string;

    constructor(id: string) {
        super(`Issue type tree ${id} not found`);
        this.message = `Issue type tree ${id} not found`;
    }
}

export class IssueTypeNotAllowedForCompanyError extends DomainError {
    readonly code = 'ISSUE_TYPE_NOT_ALLOWED_FOR_COMPANY';
    readonly message: string;

    constructor(issueTypeId: string, companyId: string) {
        super(`Issue type ${issueTypeId} is not available for company ${companyId}`);
        this.message = `Issue type ${issueTypeId} is not available for company ${companyId}`;
    }
}