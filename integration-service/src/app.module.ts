// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CorrelationMiddleware } from './shared/middleware/correlation.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CqrsModule } from '@nestjs/cqrs';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

import { DatabaseModule } from './infrastructure/persistence/database.module';
import { ExternalModule } from './infrastructure/external/external.module';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { PresentationModule } from './presentation/presentation.module';

import { configuration } from './infrastructure/config/configuration';
import { TypeOrmConfigService } from './infrastructure/persistence/typeorm/typeorm-config.service';
import { winstonConfig } from './infrastructure/logging/winston.config';
import { WinstonModule } from 'nest-winston';

@Module({
  imports: [
    // Configuración
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env',
      ],
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
        throttlers: [{
          ttl: config.get('throttler.ttl', 60),
          limit: config.get('throttler.limit', 100),
          ignoreUserAgents: [/health-check/, /metrics/],
        }]
      }),
    }),

    // Base de datos
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useClass: TypeOrmConfigService,
    }),

    // Métricas Prometheus
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),

    // CQRS
    CqrsModule,

    // Eventos
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Health checks
    TerminusModule.forRoot(),

    // Módulos de infraestructura
    DatabaseModule,
    ExternalModule,
    LoggingModule,

    // Módulo de presentación
    PresentationModule,
  ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(CorrelationMiddleware).forRoutes('*');
    }
}