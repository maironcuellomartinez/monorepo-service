// api-gateway/common/utils/result-to-http.ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { Result } from '@app/result';

/**
 * Unwraps a Result and returns the value, or throws an HttpException on failure.
 * Maps domain errors to appropriate HTTP status codes.
 */
export function unwrapOrThrow<T>(result: Result<T>): T {
    if (result.isFailure) {
        const error = result.unwrapError();
        const message = error instanceof Error ? error.message : String(error);

        // Map known domain error codes to HTTP statuses
        const code = (error as any)?.code as string | undefined;
        if (code) {
            if (code.includes('NOT_FOUND')) throw new HttpException(message, HttpStatus.NOT_FOUND);
            if (code.includes('UNAUTHORIZED') || code.includes('NOT_AUTHORIZED')) throw new HttpException(message, HttpStatus.FORBIDDEN);
            // Fallo de un servicio dependiente (ej. integration-service caído),
            // no un error del cliente — antes caía al default BAD_REQUEST, lo
            // que hacía ver un problema de infraestructura como un 400 de datos.
            if (code.includes('UNREACHABLE') || code.includes('UPSTREAM')) throw new HttpException(message, HttpStatus.BAD_GATEWAY);
            if (
                code.includes('ALREADY') ||
                code.includes('INVALID') ||
                code.includes('UNAVAILABLE') ||
                code.includes('NOT_AVAILABLE') ||
                code.includes('INSUFFICIENT')
            ) throw new HttpException(message, HttpStatus.CONFLICT);
        }

        throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
    return result.unwrap();
}
