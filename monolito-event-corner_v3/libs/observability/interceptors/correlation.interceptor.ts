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

        const tracer = trace.getTracer(process.env.SERVICE_NAME ?? 'app');

        return new Observable((subscriber) => {
            tracer.startActiveSpan(`${req.method} ${req.url}`, (span) => {
                span.setAttribute('correlation.id', correlationId);

                this.correlation.run(async () => {
                    next.handle().subscribe({
                        next: (v) => subscriber.next(v),
                        error: (e) => {
                            span.recordException(e);
                            span.setStatus({ code: 2 });
                            span.end();
                            subscriber.error(e);
                        },
                        complete: () => {
                            span.end();
                            subscriber.complete();
                        },
                    });
                }, { correlationId }).catch((e) => {
                    span.recordException(e);
                    span.setStatus({ code: 2 });
                    span.end();
                    subscriber.error(e);
                });
            });
        });
    }
}
