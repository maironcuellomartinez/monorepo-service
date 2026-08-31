// apps/api-gateway/main.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { LoggerService } from '@app/observability';
import { ApiGatewayModule } from './api-gateway.module';

// Sin este handler, una promesa rechazada fuera de un try/catch termina el
// proceso — Node lo hace por default desde la v15.
process.on('unhandledRejection', (reason) => {
  new Logger('UnhandledRejection').error(
    reason instanceof Error ? reason.stack : String(reason),
  );
});

// La validación de env vars la hace Joi vía ConfigModule.forRoot()
// (apps/api-gateway/src/config/env.validation.ts) — corre en todos los
// ambientes, no solo staging/prod, y lista todas las variables inválidas
// de una sola vez en vez de una por una.

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule, { bufferLogs: true });
  app.useLogger(app.get(LoggerService));
  const logger = new Logger('Bootstrap');

  // En staging/prod Apache termina TLS y reenvía HTTP a localhost:3000.
  // "trust proxy" permite leer X-Forwarded-Proto / X-Real-IP correctamente.
  // NO se agrega acá el rechazo 426 "solo HTTPS" (patrón de
  // api-middleware-service): micorner le pega directo a API_GATEWAY_URL
  // (ej: http://api-gateway:3000) para /outbound/servicenow/*, sin pasar
  // por el proxy público — mismo error ya cometido y corregido en
  // abac-microservice, no se repite acá.
  if (env !== 'development') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // origin:true refleja el Origin entrante — con credentials:true eso es
  // "cualquier sitio, con cookies/Authorization". Solo aceptable en
  // development; si CORS_ORIGINS falta en staging/prod, cerrar (array
  // vacío) en vez de abrir por default (ver M-09 en la auditoría de
  // 2026-08-31 — mismo criterio que ya aplica abac-microservice/src/main.ts).
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : env === 'development'
      ? true
      : [];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-correlation-id',
    ],
  });

  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  if (env !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Event Corner — API Gateway')
      .setDescription(
        'Punto de entrada unico para todas las operaciones de Event Corner v3',
      )
      .setVersion('3.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'jwt',
      )
      .addTag('Auth', 'Autenticacion — solo Entra ID (Azure AD) para usuarios')
      .addTag('Incidents', 'Gestion del ciclo de vida de incidencias')
      .addTag('Corners', 'Corners, horarios y asignacion de tecnicos')
      .addTag('Availability', 'Consulta de disponibilidad de slots y tecnicos')
      .addTag('Issue Types', 'Tipos de incidencia (solo admin)')
      .addTag('Requests', 'Solicitudes de usuario')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger disponible en /docs');
  }

  app.enableShutdownHooks();

  const shutdownSignals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of shutdownSignals) {
    process.once(signal, async () => {
      logger.log(`Senal ${signal} recibida — iniciando shutdown graceful`);
      await app.close();
      logger.log('api-gateway detenido limpiamente');
      process.exit(0);
    });
  }

  const port = parseInt(process.env.API_GATEWAY_PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`api-gateway [${env}] corriendo en 0.0.0.0:${port}`);
}
bootstrap();
