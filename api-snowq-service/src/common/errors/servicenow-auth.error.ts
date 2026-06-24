/**
 * Error de autenticación o autorización de ServiceNow.
 * @example
 * const error = new ServiceNowAuthError('Error de autenticación o autorización de ServiceNow');
 * @description Error de autenticación o autorización de ServiceNow. Se lanza cuando ocurre un error de autenticación o autorización.
 */
export class ServiceNowAuthError extends Error {
    public readonly isAuthError: boolean = true;
    public readonly statusCode: 401 | 403;
    public readonly errorCode: string = 'ServiceNowAuthError';
    public readonly errorMessage: string;

    constructor(message: string, statusCode: 401 | 403, customErrorMessage?: string) {
        super(message);
        this.name = 'ServiceNowAuthError';
        this.statusCode = statusCode;
        this.errorMessage =
            customErrorMessage || 'Authentication or authorization error with ServiceNow.';
        Object.setPrototypeOf(this, ServiceNowAuthError.prototype);
    }
}
