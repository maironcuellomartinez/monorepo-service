// common/common.module.ts
import { Global, Module } from '@nestjs/common';
import { CorrelationIdService } from './services/correlation-id.service';
import { LoggerService } from './services/logger-winston.service';
import { CorrelationMiddleware } from './middleware/correlation.middleware';
import { HttpLoggerInterceptor } from './interceptors/http-logger.interceptor';
import { TracingInterceptor } from './interceptors/tracing.interceptor';
import { M2mJwtGuard } from './guards/m2m-jwt.guard';

/**
 * Módulo global que provee servicios de observabilidad (correlationId, logger, tracing)
 * a todos los demás módulos sin necesidad de importar explícitamente.
 *
 * M2mJwtGuard se registra acá (en vez de dejar que @UseGuards(M2mJwtGuard)
 * lo instancie implícitamente) para garantizar una única instancia singleton
 * en toda la app — necesario para que su RevokedApplicationsPoller arranque
 * una sola vez vía OnModuleInit y no una instancia nueva (sin poller
 * corriendo) por cada módulo que lo referencia.
 */
@Global()
@Module({
    providers: [CorrelationIdService, LoggerService, CorrelationMiddleware, HttpLoggerInterceptor, TracingInterceptor, M2mJwtGuard],
    exports: [CorrelationIdService, LoggerService, CorrelationMiddleware, HttpLoggerInterceptor, TracingInterceptor, M2mJwtGuard],
})
export class CommonModule {}
