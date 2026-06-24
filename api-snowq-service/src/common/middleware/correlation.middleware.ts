// common/middleware/correlation.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { CorrelationIdService } from '../services/correlation-id.service';

/**
 * Extrae el correlationId del header `x-correlation-id` (propagado por api-gateway/monolith)
 * o genera uno nuevo si no viene. Lo establece en el AsyncLocalStorage para que todos los
 * logs dentro del request scope lo incluyan automáticamente.
 *
 * También refleja el correlationId en el header de respuesta `X-Correlation-Id`.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
    constructor(private readonly correlationService: CorrelationIdService) {}

    use(req: Request, res: Response, next: NextFunction): void {
        const incomingCid =
            (req.headers['x-correlation-id'] as string | undefined) ||
            (req.headers['x-cid'] as string | undefined) ||
            randomUUID();

        res.setHeader('X-Correlation-Id', incomingCid);

        // Ejecutar next() dentro del contexto ALS con el correlationId del request.
        // Todas las operaciones async downstream heredan este contexto.
        this.correlationService
            .run(async () => { next(); }, { correlationId: incomingCid })
            .catch(() => { /* errores manejados por Express */ });
    }
}
