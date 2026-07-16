// src/main.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carga .env.<NODE_ENV> antes de que NestJS inicialice cualquier módulo
const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory, Reflector } from '@nestjs/core';
import {
  ValidationPipe,
  VersioningType,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { AppModule } from './app.module';
import { LoggerService } from './infrastructure/logging/logger.service';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from './shared/interceptors/transform-response.interceptor';
import { TimeoutInterceptor } from './shared/interceptors/timeout.interceptor';

function validateConfig(): void {
  if (env === 'development') return;

  const required: Record<string, string> = {
    JWT_SECRET: 'Secret para validar tokens JWT entrantes',
    ABAC_M2M_TOKEN: 'Token M2M para autenticarse ante ABAC',
    DB_HOST: 'Host de la base de datos',
    DB_PASSWORD: 'Contraseña de la base de datos',
  };

  const invalid = Object.entries(required).filter(
    ([key]) => !process.env[key] || process.env[key] === 'CHANGE_ME',
  );

  if (invalid.length > 0) {
    const lines = invalid
      .map(([key, desc]) => `  • ${key} — ${desc}`)
      .join('\n');
    throw new Error(
      `Variables de entorno requeridas no configuradas:\n${lines}\n` +
        `Revisa el archivo .env.${env} antes de iniciar el servicio.`,
    );
  }
}

async function bootstrap() {
  try {
    validateConfig();
  } catch (err: any) {
    console.error(`\n[Bootstrap] ${err.message}\n`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(LoggerService));

  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);

  // Security Middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // app.use(compression());
  // app.use(cookieParser());

  // CORS Configuration
  app.enableCors({
    origin: configService.get('cors.origin', '*'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: configService.get('cors.credentials', false),
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-ID',
      'X-API-Key',
    ],
    exposedHeaders: [
      'X-Correlation-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
    ],
  });

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: configService.get('throttler.ttl', 60000),
    max: configService.get('throttler.limit', 100),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: {
      statusCode: 429,
      message: 'Too many requests, please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
    },
  });

  app.use('/api/', limiter);

  // Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
        exposeDefaultValues: true,
      },
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // Global Filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(configService),
    new TransformResponseInterceptor(),
    new ClassSerializerInterceptor(reflector),
  );

  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  // Swagger Configuration
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Integration Service API')
      .setDescription('Microservicio de integración con sistemas externos')
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      })
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API Key for external services',
        },
        'api-key',
      )
      .addTag('integration', 'Endpoints de integración')
      .addTag('health', 'Health checks')
      .addTag('metrics', 'Métricas del sistema')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
      customSiteTitle: 'Integration Service API Documentation',
      customfavIcon: 'https://nestjs.com/img/logo-small.svg',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info { margin: 20px 0 }
      `,
    });
  }

  // Shutdown Hooks
  app.enableShutdownHooks();

  // Global Prefix
  app.setGlobalPrefix('api');

  const port = configService.get<number>('port', 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen(port, host);
  console.log(`
      Application is running on: http://${host}:${port}
      API Documentation: http://${host}:${port}/api/docs
      Health Check: http://${host}:${port}/api/health
      Metrics: http://${host}:${port}/api/metrics
      Environment: ${configService.get('NODE_ENV', 'development')}
  `);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
