import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
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
    ScheduleModule.forRoot(),
    CircuitBreakerModule, // global — CircuitBreakerService injectable en todos los módulos
    HttpModule.register({ global: true }),
    BulkheadModule,
    SnowRequestsModule,
    MonitoringModule,
    HealthModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TracingInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');

    // BulkheadMiddleware cubre ambos flujos — cada uno con su propio pool:
    //   /monitoring/*    → monitoring:alerts   (30c / 200q)  — aislado de snow-requests
    //   /snow-requests/* → snow-requests:async  o :immediate  (según path)
    consumer.apply(BulkheadMiddleware).forRoutes('snow-requests', 'monitoring');
  }
}
