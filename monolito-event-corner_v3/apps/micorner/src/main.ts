import * as dotenv from 'dotenv';
import * as path from 'path';

const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LoggerService } from '@app/observability';
import { MicornerModule } from './micorner.module';

// Sin este handler, una promesa rechazada fuera de un try/catch (ej: un
// @Interval/@Cron con la DB caída) termina el proceso — Node lo hace por
// default desde la v15. Logueamos y seguimos: la degradación queda a cargo
// de cada job/servicio, no de que el proceso entero muera.
process.on('unhandledRejection', (reason) => {
  new Logger('UnhandledRejection').error(
    reason instanceof Error ? reason.stack : String(reason),
  );
});

async function bootstrap() {
  const app = await NestFactory.create(MicornerModule, { bufferLogs: true });
  app.useLogger(app.get(LoggerService));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const logger = new Logger('Bootstrap');

  const config = new DocumentBuilder()
    .setTitle('Micorner — Internal API')
    .setDescription(
      'API interna del micorner Event Corner v3. ' +
        'Solo accesible desde el API Gateway mediante JWT M2M (Authorization: Bearer <token>). ' +
        'No expuesta directamente a clientes externos.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  if (env !== 'production') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('internal-docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Es el servicio con más estado en vuelo del ecosistema: outbox worker,
  // cinco @Cron/@Interval jobs y el buffer del transporte de logs. Sin esto
  // un `pm2 restart micorner` (o cualquier SIGTERM) mata el proceso a mitad
  // de un flush o de un job en curso, en vez de dejarlos terminar — es el
  // único de los cinco servicios que no lo tenía (ver M-08 en la auditoría
  // de 2026-08-31).
  app.enableShutdownHooks();

  const shutdownSignals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of shutdownSignals) {
    process.once(signal, async () => {
      logger.log(`Señal ${signal} recibida — iniciando shutdown graceful`);
      await app.close();
      logger.log('micorner detenido limpiamente');
      process.exit(0);
    });
  }

  const port = parseInt(process.env.MICORNER_PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();
