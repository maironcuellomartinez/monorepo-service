import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');
    private readonly isProduction: boolean;

    constructor(private readonly config: ConfigService) {
        this.isProduction = config.get('app.env') !== 'development';
    }

    use(req: Request, res: Response, next: NextFunction): void {
        const { method, originalUrl, ip } = req;
        const start = Date.now();

        res.once('finish', () => {
            const ms     = Date.now() - start;
            const status = res.statusCode;
            const level  = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';

            if (this.isProduction) {
                this.logger[level](JSON.stringify({
                    method,
                    url:       originalUrl,
                    status,
                    ms,
                    ip,
                    userAgent: req.headers['user-agent'] ?? '',
                }));
            } else {
                this.logger[level](`${method} ${originalUrl} → ${status} (${ms}ms) [${ip}]`);
            }
        });

        next();
    }
}
