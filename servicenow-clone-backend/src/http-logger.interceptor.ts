import {
    CallHandler,
    ExecutionContext,
    Injectable,
    Logger,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
    private readonly logger = new Logger('SN-Clone');

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const { method, url } = req;
        const start = Date.now();

        this.logger.log(`→ ${method} ${url}`);

        return next.handle().pipe(
            tap({
                next: (data) => {
                    const ms = Date.now() - start;
                    const result = data?.result;
                    const summary = result
                        ? `number=${result.number ?? '-'} sys_id=${result.sys_id ?? '-'} state=${result.state ?? '-'}`
                        : Array.isArray(result)
                            ? `${result.length} registro(s)`
                            : 'ok';
                    this.logger.log(`← ${method} ${url} [${ms}ms] ${summary}`);
                },
                error: (err) => {
                    const ms = Date.now() - start;
                    this.logger.error(`← ${method} ${url} [${ms}ms] ERROR ${err?.status ?? 500}: ${err?.message}`);
                },
            }),
        );
    }
}
