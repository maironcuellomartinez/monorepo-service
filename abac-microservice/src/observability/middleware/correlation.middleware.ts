import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CorrelationIdService } from '../services/correlation-id.service';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
    constructor(private readonly correlation: CorrelationIdService) { }

    use(req: Request, res: Response, next: NextFunction) {
        const incoming = req.headers['x-correlation-id'] as string ?? uuidv4();

        void this.correlation.run(async () => {
            this.correlation.addLabel({ correlationId: incoming });
            res.setHeader('X-Correlation-Id', incoming);
            next();
        }, { correlationId: incoming });
    }
}
