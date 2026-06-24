import {
    CallHandler,
    ExecutionContext,
    Injectable,
    Logger,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { CorrelationIdService } from '../services/correlation-id.service';

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    constructor(private readonly correlationService: CorrelationIdService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const { method, url } = req;
        const cid = this.correlationService.getCorrelationId();
        const start = Date.now();

        this.logger.log(`→ ${method} ${url} [cid=${cid}]`);

        return next.handle().pipe(
            tap({
                next: (data) => {
                    const ms = Date.now() - start;
                    this.logger.log(`← ${method} ${url} [${ms}ms] [cid=${cid}] action=${data?.action ?? 'ok'}`);
                },
                error: (err) => {
                    const ms = Date.now() - start;
                    this.logger.error(`← ${method} ${url} [${ms}ms] [cid=${cid}] ERROR ${err?.status ?? 500}: ${err?.message}`);
                },
            }),
        );
    }
}
