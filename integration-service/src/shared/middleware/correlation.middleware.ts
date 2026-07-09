import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { CorrelationIdService } from '../../infrastructure/logging/correlation-id.service';

/**
 * Propaga x-correlation-id entrante al AsyncLocalStorage para que todos los
 * logs y llamadas salientes (MinervaConnector, DroppointConnector, etc.) puedan
 * acceder al ID sin pasarlo explícitamente por parámetro.
 *
 * Debe ser el primer middleware en la cadena (antes de guards e interceptors).
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
    constructor(private readonly correlationService: CorrelationIdService) {}

    use(req: Request, res: Response, next: NextFunction): void {
        const cid =
            (req.headers['x-correlation-id'] as string | undefined) ||
            randomUUID();

        res.setHeader('X-Correlation-Id', cid);

        this.correlationService
            .run(async () => { next(); }, cid)
            .catch(() => { /* errores manejados por Express */ });
    }
}
