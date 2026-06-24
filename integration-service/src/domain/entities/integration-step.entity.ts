export class IntegrationStep {
    public id: string;
    public systemId: string;
    public status: string;
    public executedAt: Date;
    public result?: any;
    public error?: string;
    public duration?: number;
    public compensationAction?: string;
    public compensationResult?: any;
    public compensationError?: string;
    public compensationDuration?: number;
    public updatedAt: Date;
    integrationEvent: any;

    constructor(

        systemId: string,
        status: string,
        executedAt: Date,
        result?: any,
        error?: string,
        duration?: number,
        compensationAction?: string,
        compensationResult?: any,
        compensationError?: string,
        compensationDuration?: number,
        updatedAt?: Date,
    ) {
        this.systemId = systemId;
        this.status = status;
        this.executedAt = executedAt;
        this.result = result;
        this.error = error;
        this.duration = duration;
        this.compensationAction = compensationAction;
        this.compensationResult = compensationResult;
        this.compensationError = compensationError;
        this.compensationDuration = compensationDuration;
        this.updatedAt = updatedAt || new Date();
    }
}