import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for testing
  app.enableCors();
  app.enableShutdownHooks();

  const port = process.env.PORT || 3015;
  await app.listen(port);

  console.log(`Minerva mock API running on port ${port}`);
}

bootstrap();
