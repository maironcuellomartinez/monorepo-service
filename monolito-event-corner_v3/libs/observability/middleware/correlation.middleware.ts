import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CorrelationIdService } from '../services';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware para agregar el ID de correlación a la solicitud
 * @example
 * ```typescript
 * @Controller('example')
 * @UseMiddleware(CorrelationMiddleware)
 * export class ExampleController {
 *   @Get()
 *   getExample() {
 *     return 'example';
 *   }
 * }
 * ```
 *
 * export AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
 *   }
 * }
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(private readonly correlation: CorrelationIdService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = (req.headers['x-correlation-id'] as string) ?? uuidv4();

    void this.correlation.run(
      // eslint-disable-next-line @typescript-eslint/require-await -- CorrelationIdService.run() exige un callback que retorne Promise
      async () => {
        res.setHeader('X-Correlation-Id', incoming);
        next();
      },
      { correlationId: incoming },
    );
  }
}
