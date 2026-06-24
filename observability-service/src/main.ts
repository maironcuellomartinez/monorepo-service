import * as dotenv from 'dotenv';
import * as path from 'path';

const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    app.enableCors({
        origin: process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
            : true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });

    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false, // ingestion accepts extra meta fields
    }));

    app.enableShutdownHooks();

    if (env !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('Observability Service')
            .setDescription('Log, trace and metric sink for the Event Corner ecosystem')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
    }

    const port = process.env.PORT ?? 3099;
    await app.listen(port);
    Logger.log(`observability-service running on :${port}`, 'Bootstrap');
}

bootstrap();
