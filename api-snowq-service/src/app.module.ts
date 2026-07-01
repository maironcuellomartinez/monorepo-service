import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { SnowRequestsModule } from './snow-requests/snow-requests.module';
import { BulkheadModule } from './resilience/bulkhead/bulkhead.module';
import { CircuitBreakerModule } from './resilience/circuit-breaker/circuit-breaker.module';
import { BulkheadMiddleware } from './resilience/bulkhead/bulkhead.middleware';
import { MonitoringModule } from './monitoring/monitoring.module';
import { CommonModule } from './common/common.module';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { HealthModule } from './health/health.module';
import { TracingInterceptor } from './common/interceptors/tracing.interceptor';

@Module({
    imports: [
        CommonModule,
        CircuitBreakerModule,   // global — CircuitBreakerService injectable en todos los módulos
        HttpModule.register({ global: true }),
        BulkheadModule,
        SnowRequestsModule,
        MonitoringModule,
        HealthModule,
    ],
    providers: [
        { provide: APP_INTERCEPTOR, useClass: TracingInterceptor },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        // CorrelationMiddleware primero: extrae x-correlation-id y establece contexto ALS
        consumer.apply(CorrelationMiddleware).forRoutes('*');
        // El bulkhead de /snow-requests protege el flujo estándar (monolito, otras apps)
        // /monitoring tiene su propia ruta — sin bulkhead aquí, Thruk siempre llega
        consumer.apply(BulkheadMiddleware).forRoutes('snow-requests');
    }
}
