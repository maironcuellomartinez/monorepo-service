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
        retryAttempts: 3,
        retryDelay: 2000,
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
