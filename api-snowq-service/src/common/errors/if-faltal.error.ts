/**
 * Error fatal de ServiceNow.
 * @example
 * const error = new ServiceNowFatalError('Error fatal de ServiceNow');
 * @description Error fatal de ServiceNow. Se lanza cuando ocurre un error fatal.
 */
export class ServiceNowFatalError extends Error {
    public readonly isFatal: boolean = true;
    public readonly statusCode: number;
    public readonly errorCode: string = 'ServiceNowFatalError';
    public readonly errorMessage: string;

    constructor(message: string, statusCode: number = 400, customErrorMessage?: string) {
        super(message);
        this.name = 'ServiceNowFatalError';
        this.statusCode = statusCode;
        this.errorMessage = customErrorMessage || 'An unexpected error occurred while processing the request.';
        Object.setPrototypeOf(this, ServiceNowFatalError.prototype);
    }
}
