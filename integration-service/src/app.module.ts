// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from './shared/middleware/correlation.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

import { ExternalModule } from './infrastructure/external/external.module';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { PresentationModule } from './presentation/presentation.module';

import { configuration } from './infrastructure/config/configuration';
import { winstonConfig } from './infrastructure/logging/winston.config';
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

    // Módulos de infraestructura
    ExternalModule,
    LoggingModule,

    // Módulo de presentación
    PresentationModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
