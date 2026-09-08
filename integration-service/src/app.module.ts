// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from './shared/middleware/correlation.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

import { SharedModule } from './shared/shared.module';
import { ObservabilityModule } from './observability/observability.module';
import { MinervaModule } from './minerva/minerva.module';
import { DroppointModule } from './droppoint/droppoint.module';
import { OutlookCalendarModule } from './outlook-calendar/outlook-calendar.module';
import { HealthController } from './health/health.controller';

import { configuration } from './config/configuration';
import { winstonConfig } from './observability/winston.config';
import { WinstonModule } from 'nest-winston';

@Module({
  imports: [
    // Configuración
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      expandVariables: true,
      cache: true,
    }),

    // Logging con Winston
    WinstonModule.forRoot(winstonConfig),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get('throttler.ttl', 60),
            limit: config.get('throttler.limit', 100),
            ignoreUserAgents: [/health-check/, /metrics/],
          },
        ],
      }),
    }),

    // Métricas Prometheus
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),

    // Health checks
    TerminusModule.forRoot(),

    // Cliente HTTP + guard M2M compartidos por todas las integraciones
    SharedModule,

    // Observabilidad (logs, correlación, tracing, métricas propias)
    ObservabilityModule,

    // Integraciones
    MinervaModule,
    DroppointModule,
    OutlookCalendarModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
