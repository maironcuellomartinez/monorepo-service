import { Injectable, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { BulkheadRegistry } from './bulkhead.registry';

/**
 * Middleware de bulkhead para /snow-requests y /monitoring.
 *
 * Cada flujo tiene su propio pool de concurrencia:
 *
 *   /monitoring/*              → monitoring:alerts   (30c / 200q / 5s)
 *   /snow-requests/immediate/* → snow-requests:immediate (10c / 20q / 30s)
 *   /snow-requests/*           → snow-requests:async    (30c / 200q / 5s)
 *
 * Una tormenta de alertas Nagios que satura monitoring:alerts
 * no afecta la capacidad de snow-requests:async ni snow-requests:immediate.
 */
@Injectable()
export class BulkheadMiddleware implements NestMiddleware {
    constructor(private readonly bulkheadRegistry: BulkheadRegistry) {}

    use(req: Request, res: Response, next: NextFunction) {
        const path = req.path;

        const bulkhead = path.startsWith('/monitoring')
            ? this.bulkheadRegistry.getOrCreate({
                name: 'monitoring:alerts',
                maxConcurrentCalls: 30,
                maxQueueSize: 200,
                queueTimeoutMs: 5_000,
                rejectWhenFull: true,
            })
            : path.startsWith('/snow-requests/immediate')
                ? this.bulkheadRegistry.getOrCreate({ name: 'snow-requests:immediate' })
                : this.bulkheadRegistry.getOrCreate({ name: 'snow-requests:async' });

        if (!bulkhead.canAccept()) {
            throw new ServiceUnavailableException(
                'El servicio está al límite de capacidad — intente nuevamente en unos momentos',
            );
        }

        (req as any).bulkhead = bulkhead;
        next();
    }
}
