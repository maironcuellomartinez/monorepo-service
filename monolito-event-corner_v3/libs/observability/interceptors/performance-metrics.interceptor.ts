import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { MetricsProducerService } from '../services/metrics-producer.service';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
    private readonly logger = new Logger(PerformanceInterceptor.name);

    constructor(private readonly metrics: MetricsProducerService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const start = performance.now();

        const { method, url, route } = req;
        const path = route?.path || url;
        const controller = context.getClass().name;
        const handler = context.getHandler().name;

        return next.handle().pipe(
            tap({
                next: (data) => {
                    const elapsed = performance.now() - start;
                    const statusCode = res.statusCode || 200;

                    this.metrics.observeHttpRequestDuration(
                        method,
                        path,
                        statusCode,
                        'success',
                        elapsed,
                    );

                    if (elapsed > 500) {
                        this.logger.warn(`Slow request: ${controller}.${handler} took ${Math.round(elapsed)}ms`);
                    }
                },
            }),
            catchError((error) => {
                const elapsed = performance.now() - start;
                const statusCode = error?.status || error?.statusCode || 500;

                this.metrics.observeHttpRequestDuration(
                    method,
                    path,
                    statusCode,
                    'error',
                    elapsed,
                );

                return throwError(() => error);
            }),
        );
    }
}
