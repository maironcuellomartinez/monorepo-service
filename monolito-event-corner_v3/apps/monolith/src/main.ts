import * as dotenv from 'dotenv';
import * as path from 'path';

const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LoggerService } from '@app/observability';
import { MonolithModule } from './monolith.module';

async function bootstrap() {
  const app = await NestFactory.create(MonolithModule, { bufferLogs: true });
  app.useLogger(app.get(LoggerService));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('Monolith — Internal API')
    .setDescription(
      'API interna del monolito Event Corner v3. ' +
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

  const port = parseInt(process.env.MONOLITH_PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();
