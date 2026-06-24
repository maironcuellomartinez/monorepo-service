export class ServiceNowTemporalError extends Error {
    public readonly isTemporary: boolean = true;
    public readonly statusCode: number;
    public readonly errorCode: string = 'ServiceNowTemporalError';
    public readonly errorMessage: string;
    /** Milisegundos hasta el próximo reintento, extraídos del header Retry-After (429). */
    public readonly retryAfterMs?: number;

    constructor(message: string, statusCode: number = 500, customErrorMessage?: string, retryAfterMs?: number) {
        super(message);
        this.name = 'ServiceNowTemporalError';
        this.statusCode = statusCode;
        this.errorMessage =
            customErrorMessage || 'A temporary error occurred while processing the request. Try again later.';
        this.retryAfterMs = retryAfterMs;
        Object.setPrototypeOf(this, ServiceNowTemporalError.prototype);
    }
}
