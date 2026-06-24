// common/common.module.ts
import { Global, Module } from '@nestjs/common';
import { CorrelationIdService } from './services/correlation-id.service';
import { LoggerService } from './services/logger-winston.service';
import { CorrelationMiddleware } from './middleware/correlation.middleware';
import { HttpLoggerInterceptor } from './interceptors/http-logger.interceptor';

/**
 * Módulo global que provee servicios de observabilidad (correlationId, logger)
 * a todos los demás módulos sin necesidad de importar explícitamente.
 */
@Global()
@Module({
    providers: [CorrelationIdService, LoggerService, CorrelationMiddleware, HttpLoggerInterceptor],
    exports: [CorrelationIdService, LoggerService, CorrelationMiddleware, HttpLoggerInterceptor],
})
export class CommonModule {}
