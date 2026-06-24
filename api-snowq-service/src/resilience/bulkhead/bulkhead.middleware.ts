/**
 * Middleware para aplicar bulkhead a nivel de request
 */
import { Injectable, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { BulkheadRegistry } from './bulkhead.registry';

@Injectable()
export class BulkheadMiddleware implements NestMiddleware {
    constructor(private readonly bulkheadRegistry: BulkheadRegistry) { }

    /**
     * Use the bulkhead middleware.
     * @param req Request
     * @param res Response
     * @param next NextFunction
     * @description
     * This middleware applies bulkhead to the request.
     * It uses the bulkhead registry to get or create a bulkhead.
     * If the bulkhead is full, it throws a ServiceUnavailableException.
     * Otherwise, it sets the bulkhead and client id on the request and calls next.
     */
    use(req: Request, res: Response, next: NextFunction) {
        const clientId = (req.headers['x-client-id'] as string) || 'anonymous';
        const path = req.path;

        // Bulkhead global de entrada: gate rápido antes de llegar al handler
        const bulkhead = path.startsWith('/snow-requests/immediate')
            ? this.bulkheadRegistry.getOrCreate({ name: 'snow-requests:immediate' })
            : this.bulkheadRegistry.getOrCreate({ name: 'snow-requests:async' });

        if (!bulkhead.canAccept()) {
            throw new ServiceUnavailableException(
                'El servicio está al límite de capacidad — intente nuevamente en unos momentos',
            );
        }

        (req as any).bulkhead = bulkhead;
        (req as any).clientId = clientId;

        next();
    }
}
