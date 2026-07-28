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

function validateConfig(): void {
  if (env === 'development') return;

  const required: Record<string, string> = {
    JWT_SECRET:
      'Secret para verificar JWT — debe coincidir con abac-microservice',
    ABAC_URL: 'URL del ABAC microservice',
    ABAC_M2M_TOKEN: 'Token M2M para llamadas internas al ABAC',
    MONOLITH_URL: 'URL interna del monolith',
    ED25519_PUBLIC_KEY: 'Clave publica Ed25519 para verificar tokens M2M',
  };

  const invalid = Object.entries(required).filter(
    ([key]) => !process.env[key] || process.env[key].startsWith('CHANGE_ME'),
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

  const app = await NestFactory.create(ApiGatewayModule, { bufferLogs: true });
  app.useLogger(app.get(LoggerService));
  const logger = new Logger('Bootstrap');

  // En staging/prod Apache termina TLS y reenvía HTTP a localhost:3000.
  // "trust proxy" permite leer X-Forwarded-Proto / X-Real-IP correctamente.
  // NO se agrega acá el rechazo 426 "solo HTTPS" (patrón de
  // api-middleware-service): monolith le pega directo a API_GATEWAY_URL
  // (ej: http://api-gateway:3000) para /outbound/servicenow/*, sin pasar
  // por el proxy público — mismo error ya cometido y corregido en
  // abac-microservice, no se repite acá.
  if (env !== 'development') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : true;
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
