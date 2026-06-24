import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsProducerService } from '../services/metrics-producer.service';
import { LoggerService } from '../services/logger.service';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
    constructor(
        private readonly metrics: MetricsProducerService,
        private readonly logger: LoggerService,
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const controllerName = context.getClass().name;
        const handlerName = context.getHandler().name;
        const operation = `${controllerName}.${handlerName}`;
        const start = Date.now();

        const baseLabels = {
            controller: controllerName,
            handler: handlerName,
            method: req.method as string,
            path: (req.route?.path ?? req.url) as string,
        };

        return next.handle().pipe(
            tap({
                next: () => {
                    const elapsed = Date.now() - start;
                    const status = String(res.statusCode ?? 200);

                    this.metrics.observeHistogram('controller_execution_duration_ms', elapsed, {
                        ...baseLabels,
                        status,
                        outcome: 'success',
                    });

                    if (elapsed > 500) {
                        this.metrics.incrementCounter('slow_requests_total', 1, baseLabels);
                        this.logger.warn(`Slow request: ${operation} took ${elapsed}ms`, 'Performance');
                    }
                },
                error: (err: any) => {
                    const elapsed = Date.now() - start;
                    const status = String(err?.status ?? err?.statusCode ?? 500);

                    this.metrics.observeHistogram('controller_execution_duration_ms', elapsed, {
                        ...baseLabels,
                        status,
                        outcome: 'error',
                    });

                    this.metrics.incrementCounter('controller_errors_total', 1, {
                        ...baseLabels,
                        error_type: err?.name ?? 'UnknownError',
                    });
                },
            }),
        );
    }
}
