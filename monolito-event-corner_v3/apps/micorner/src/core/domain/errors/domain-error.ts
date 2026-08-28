// core/domain/errors/domain-error.ts
export abstract class DomainError extends Error {
    abstract readonly code: string;
    readonly timestamp: Date;

    constructor(message: string) {
        super(message);
        this.name = 'DomainError';
        this.timestamp = new Date();
        Object.setPrototypeOf(this, new.target.prototype);
    }
}