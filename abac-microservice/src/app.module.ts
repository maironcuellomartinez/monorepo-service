import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { appConfig } from './config/app.config';
import databaseConfig from './config/database.config';
import { CorrelationMiddleware, ObservabilityModule } from './observability';
import { AuthModule } from './auth/auth.module';
import { AuditModule, PolicyModule } from './modules';

import { AbacModule } from './abac/abac.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './abac/interceptors/audit.interceptor';
import { HealthModule } from './health/health.module';

/**
 * @description
 * Root module for the application
 * @returns {Module} AppModule
 * @version 1.0.0
 * @author Mairon Cuello
 * @license MIT
 * @copyright 2025 Mairon Cuello
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        ...config.get('database')!,
        // Antes 3 intentos x 2s = 6s de margen para que MySQL acepte
        // conexiones al arrancar — bien por debajo de los 30s (10x3s) que
        // TypeORM usa por default. ABAC es el primer servicio de la cadena
        // de arranque, así que una demora acá se propaga a todo el ecosistema.
        retryAttempts: 10,
        retryDelay: 3000,
      }),
      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwtSecret'),
        signOptions: { expiresIn: config.get('jwtExpiresIn') },
      }),
      inject: [ConfigService],
    }),
    PassportModule,
    AbacModule,
    AuthModule,
    PolicyModule,
    AuditModule,
    ObservabilityModule.forRoot({ serviceName: 'abac-microservice' }),
    HealthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).exclude('/health', '/api-docs', '/metrics').forRoutes('{*path}')
  }
}
