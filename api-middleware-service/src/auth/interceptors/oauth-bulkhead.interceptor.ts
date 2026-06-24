import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    HttpException,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { BulkheadRegistry, BulkheadRejectedError, BulkheadTimeoutError } from '@backendkit-labs/bulkhead';

/**
 * Interceptor que envuelve la ejecución del handler de /oauth/token dentro del bulkhead.
 *
 * A diferencia de un guard, el interceptor recibe `next.handle()` — el Observable
 * que representa la ejecución real del handler con DI completa. Esto permite que
 * bulkhead.execute() controle exactamente cuándo se corre el handler, sin dobles
 * invocaciones ni problemas con los decoradores @Body/@Headers.
 */
@Injectable()
export class OAuthBulkheadInterceptor implements NestInterceptor {
    private readonly logger = new Logger(OAuthBulkheadInterceptor.name);

    constructor(private readonly registry: BulkheadRegistry) {}

    intercept(_ctx: ExecutionContext, next: CallHandler): Observable<any> {
        const bulkhead = this.registry.getOrCreate({
            name:               'oauth:token',
            maxConcurrentCalls: 3,
            maxQueueSize:       5,
            queueTimeoutMs:     5000,
            rejectWhenFull:     true,
        });

        return new Observable(subscriber => {
            bulkhead
                .execute(() => firstValueFrom(next.handle()))
                .then(value => {
                    subscriber.next(value);
                    subscriber.complete();
                })
                .catch(err => {
                    subscriber.error(this.mapError(err));
                });
        });
    }

    private mapError(error: unknown): HttpException {
        if (error instanceof BulkheadRejectedError) {
            this.logger.warn('Bulkhead oauth:token saturado — rechazando peticion');
            return new HttpException(
                {
                    statusCode: 429,
                    error:      'Too Many Requests',
                    message:    'Demasiados intentos de autenticacion. Intente nuevamente en unos segundos.',
                },
                429,
            );
        }
        if (error instanceof BulkheadTimeoutError) {
            return new HttpException(
                {
                    statusCode: 408,
                    error:      'Request Timeout',
                    message:    'El servidor esta procesando demasiadas solicitudes de autenticacion.',
                },
                408,
            );
        }
        if (error instanceof HttpException) return error;
        throw error;
    }
}
