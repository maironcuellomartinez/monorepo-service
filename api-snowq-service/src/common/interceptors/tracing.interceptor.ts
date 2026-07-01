import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TracingClient } from '../tracing.client';
import { CorrelationIdService } from '../services/correlation-id.service';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
    constructor(private readonly correlationService: CorrelationIdService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req  = context.switchToHttp().getRequest();
        const { method, url } = req;
        const route = req.route?.path ?? url;
        const correlationId = this.correlationService.getCorrelationId();
        const tracer = TracingClient.getInstance();

        return new Observable(subscriber => {
            tracer.run(
                `${method} ${route}`,
                {
                    kind: 'server',
                    correlationId,
                    attributes: {
                        'http.method': method,
                        'http.url':    url,
                        'http.route':  route,
                    },
                },
                () => new Promise<void>((resolve, reject) => {
                    next.handle().subscribe({
                        next:     (val) => subscriber.next(val),
                        error:    (err) => { subscriber.error(err); reject(err); },
                        complete: ()    => { subscriber.complete(); resolve(); },
                    });
                }),
            ).catch(err => subscriber.error(err));
        });
    }
}
