import { Injectable } from '@nestjs/common';
import { ServiceNowAuthError, ServiceNowFatalError, ServiceNowTemporalError } from '../../common';

@Injectable()
export class ServiceNowErrorFactory {
    /**
     * Crea un error de ServiceNow.
     * @example
     * const error = serviceNowErrorFactory.create(400, 'Bad Request');
     * @param statusCode Status code
     * @param message Message
     * @param errorMessage Error message
     * @returns Error
     * @description Crea un error de ServiceNow.
     * Si el status code es 400, 404, 422, retorna un error fatal.
     * Si el status code es 408, 500, 502, 503 o 504, retorna un error temporal.
     * Si el status code es 401, 403, retorna un error de autenticación o autorización.
     */
    create(statusCode: number, message: string, errorMessage?: string, retryAfterMs?: number): Error {
        if ([400, 404, 422].includes(statusCode)) {
            return new ServiceNowFatalError(message, statusCode, errorMessage);
        }
        if ([401, 403].includes(statusCode)) {
            return new ServiceNowAuthError(message, statusCode as 401 | 403, errorMessage);
        }
        if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
            return new ServiceNowTemporalError(message, statusCode, errorMessage, retryAfterMs);
        }
        // Default: considerarlo fatal si es desconocido
        return new ServiceNowFatalError(message, statusCode, errorMessage);
    }
}
