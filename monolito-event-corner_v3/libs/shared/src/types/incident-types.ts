import { IncidentId, TechnicianId } from "./branded-ids"

export { IncidentId } from "./branded-ids"

export type IncidentStatus =
    | 'CREATED'
    | 'IN_PROGRESS'
    | 'PAUSED'
    | 'WAITING_FOR_RESPONSE'
    | 'CLOSED'
    | 'REOPENED'
    | 'CANCELED'

export type IncidentOriginChannel = 'CUSTOMER_APP' | 'MANAGER_PORTAL' | 'TECH_APP'

export type IssueCategory = 'ISSUE' | 'REQUEST' | 'REQUEST_ONBOARDING' | 'REQUEST_DECOMISSION'

export type PriorityLevel = 1 | 2 | 3 | 4 | 5

export type LockerStatus = 'AVAILABLE' | 'OCCUPIED' | 'OUT_OF_SERVICE'

// shared/errors/domain-errors.ts
export class DomainError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'DomainError'
    }
}

export class IncidentNotFoundError extends DomainError {
    constructor(id: IncidentId) {
        super(`Incident with id ${id} not found`)
        this.name = 'IncidentNotFoundError'
    }
}

export class InvalidIncidentStateError extends DomainError {
    constructor(status: IncidentStatus, operation: string) {
        super(`Cannot ${operation} incident in state ${status}`)
        this.name = 'InvalidIncidentStateError'
    }
}

export class LockerNotAvailableError extends DomainError {
    constructor(lockerId: string) {
        super(`Locker ${lockerId} is not available`)
        this.name = 'LockerNotAvailableError'
    }
}

export class TechnicianNotAvailableError extends DomainError {
    constructor(technicianId: TechnicianId, date: Date) {
        super(`Technician ${technicianId} not available on ${date}`)
        this.name = 'TechnicianNotAvailableError'
    }
}