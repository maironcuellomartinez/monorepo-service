import * as dotenv from 'dotenv';
import * as path from 'path';

// Carga .env.<NODE_ENV> antes de que NestJS inicialice cualquier módulo
const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TracingClient } from './common/tracing.client';
import { LoggerService } from './common/services/logger-winston.service';

function validateConfig(): void {
  if (env === 'development') return;

  const required: Record<string, string> = {
    ED25519_PUBLIC_KEY:
      'Clave pública Ed25519 para verificar tokens M2M (base64)',
    ABAC_M2M_TOKEN: 'Token M2M para autenticarse ante ABAC',
    BASE_URL_SERVICENOW: 'URL base de la instancia real de ServiceNow',
    SN_AUTH: 'Credenciales Basic Auth para ServiceNow (base64)',
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

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(LoggerService));
  const logger = new Logger('Bootstrap');

  // Habilitar CORS para el dashboard
  app.enableCors({
    origin: ['http://localhost:3091', 'http://127.0.0.1:3091'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Swagger solo en entornos no productivos
  if (env !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('api-snowq-service')
      .setDescription('Cola y circuit breaker hacia ServiceNow')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .addTag('Snow Requests', 'Gestión de tickets ServiceNow')
      .addTag('Monitoring', 'Alertas Nagios/Thruk')
      .addTag('Health', 'Estado del servicio')
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
      await TracingClient.getInstance().shutdown();
      await app.close();
      logger.log('api-snowq-service detenido limpiamente');
      process.exit(0);
    });
  }

  const port = parseInt(process.env.PORT ?? '3090', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  logger.log(`api-snowq-service [${env}] corriendo en ${host}:${port}`);
}
bootstrap();
