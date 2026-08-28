import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    RequestTimeoutException,
    Logger,
} from '@nestjs/common';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
    private readonly logger = new Logger(TimeoutInterceptor.name);
    private readonly defaultTimeout: number;

    constructor(private readonly configService: ConfigService) {
        this.defaultTimeout = this.configService.get<number>('timeout.default', 10000);
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const correlationId = request.headers['x-correlation-id'] || 'N/A';
        const url = request.url;
        const method = request.method;

        // Obtener timeout específico del endpoint si existe
        const endpointTimeout = this.getEndpointTimeout(url, method);
        const timeoutValue = endpointTimeout || this.defaultTimeout;

        this.logger.debug('Setting request timeout', TimeoutInterceptor.name, {
            correlationId,
            url,
            method,
            timeout: `${timeoutValue}ms`,
        });

        return next.handle().pipe(
            timeout(timeoutValue),
            catchError((err) => {
                if (err instanceof TimeoutError) {
                    this.logger.warn('Request timeout exceeded', TimeoutInterceptor.name, {
                        correlationId,
                        url,
                        method,
                        timeout: `${timeoutValue}ms`,
                    });

                    return throwError(
                        () =>
                            new RequestTimeoutException({
                                message: `Request timeout after ${timeoutValue}ms`,
                                errorCode: 'REQUEST_TIMEOUT',
                                correlationId,
                            }),
                    );
                }
                return throwError(() => err);
            }),
        );
    }

    private getEndpointTimeout(url: string, method: string): number | null {
        // Configuración de timeouts por endpoint
        const endpointTimeouts = {
            'POST /integration/appointments': 30000, // 30 segundos para procesar integraciones
            'GET /health': 5000, // 5 segundos para health checks
            'GET /metrics': 10000, // 10 segundos para métricas
        };

        const key = `${method} ${url.split('?')[0]}`; // Remover query params
        return endpointTimeouts[key] || null;
    }
}