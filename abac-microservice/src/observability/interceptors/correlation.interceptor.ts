import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { CorrelationIdService } from '../services/correlation-id.service';
import { trace } from '@opentelemetry/api';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
    constructor(private readonly correlation: CorrelationIdService) { }

    intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
        const req = ctx.switchToHttp().getRequest();
        const incoming = req.headers['x-correlation-id'] || req.headers['x-cid'];
        const correlationId = typeof incoming === 'string' ? incoming : uuid();
        const tracer = trace.getTracer('http');

        return new Observable((subscriber) => {
            tracer.startActiveSpan(`${req.method} ${req.url}`, async (span) => {
                try {
                    await this.correlation.run(async () => {
                        span.setAttribute('correlation.id', correlationId);

                        next.handle().subscribe({
                            next: (v) => subscriber.next(v),
                            error: (e) => {
                                span.recordException(e);
                                span.setStatus({ code: 2 });
                                subscriber.error(e);
                            },
                            complete: () => subscriber.complete(),
                        });
                    }, { correlationId });
                } finally {
                    span.end();
                }
            });
        });
    }
}
