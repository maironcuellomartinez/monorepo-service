import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { CorrelationIdService } from '../services/correlation-id.service';
import { TracingService } from '../services/telemetry/tracing.service';

/**
 * Establece el contexto de correlación y envuelve el request completo en un
 * span "server" enviado a observability-service (via TracingService, HTTP-direct).
 * Reemplaza el uso previo de @opentelemetry/api (tracer no-op — ver otel.sdk.ts),
 * que creaba spans que nunca salían del proceso.
 */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
    constructor(
        private readonly correlation: CorrelationIdService,
        private readonly tracing: TracingService,
    ) { }

    intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
        const req = ctx.switchToHttp().getRequest();
        const incoming = req.headers['x-correlation-id'] || req.headers['x-cid'];
        const correlationId = typeof incoming === 'string' ? incoming : uuid();

        return new Observable((subscriber) => {
            this.correlation.run(async () => {
                await this.tracing.run(
                    `${req.method} ${req.url}`,
                    { kind: 'server' },
                    () => new Promise<void>((resolve, reject) => {
                        next.handle().subscribe({
                            next: (v) => subscriber.next(v),
                            error: (e) => { subscriber.error(e); reject(e); },
                            complete: () => { subscriber.complete(); resolve(); },
                        });
                    }),
                );
            }, { correlationId }).catch((e) => subscriber.error(e));
        });
    }
}
