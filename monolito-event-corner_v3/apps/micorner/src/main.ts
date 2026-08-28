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

  const port = parseInt(process.env.MICORNER_PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();
