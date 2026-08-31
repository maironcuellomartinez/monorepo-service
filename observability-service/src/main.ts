import * as dotenv from 'dotenv';
import * as path from 'path';

const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Sin este handler, una promesa rechazada fuera de un try/catch termina el
// proceso — Node lo hace por default desde la v15.
process.on('unhandledRejection', (reason) => {
    new Logger('UnhandledRejection').error(
        reason instanceof Error ? reason.stack : String(reason),
    );
});

// Era el único servicio del ecosistema sin esta validación de arranque — si
// falta ED25519_PUBLIC_KEY, Ed25519Guard rechaza CADA request entrante con
// 401 y el primer síntoma visible es que dejan de llegar logs/métricas/
// trazas de los seis servicios, sin ningún error explícito en el propio
// observability-service (ver M-10 en la auditoría de 2026-08-31).
function validateConfig(): void {
    if ((process.env.NODE_ENV ?? 'development') === 'development') return;

    const required: Record<string, string> = {
        ED25519_PUBLIC_KEY: 'Clave pública Ed25519 para verificar los Bearer M2M entrantes (base64)',
    };

    const invalid = Object.entries(required).filter(
        ([key]) => !process.env[key] || process.env[key]!.startsWith('CHANGE_ME'),
    );

    if (invalid.length > 0) {
        const lines = invalid.map(([key, desc]) => `  • ${key} — ${desc}`).join('\n');
        throw new Error(
            `Variables de entorno requeridas no configuradas:\n${lines}\n` +
            `Revisa el archivo .env.${process.env.NODE_ENV} antes de iniciar el servicio.`,
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

    // NO se replica acá el rechazo 426 "solo HTTPS" de api-middleware-service:
    // ese patrón asume que TODO el tráfico del servicio entra por Apache, lo
    // cual vale para api-middleware-service (puramente browser/externo) pero
    // NO para observability-service — monolith/gateway/abac/snowq/integration
    // le pegan directo a LOG_TRANSPORT_URL/OBS_METRICS_URL/OBS_TRACES_URL
    // (ej: http://localhost:3099/ingest/logs) sin pasar por el proxy público;
    // un rechazo global rompería la ingesta de telemetría de todo el
    // ecosistema. Ver commit que corrige el mismo error ya cometido en
    // abac-microservice.
    //
    // "trust proxy" sí se deja — no tiene costo y sirve si el único caller
    // browser (observability-dashboard vía /obs-api/) necesita en algún
    // momento el protocolo/IP real.
    if (env !== 'development') {
        app.getHttpAdapter().getInstance().set('trust proxy', 1);
    }

    // Si CORS_ORIGINS falta en staging/prod, cerrar (array vacío) en vez de
    // abrir por default (ver M-09 en la auditoría de 2026-08-31).
    app.enableCors({
        origin: process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
            : env === 'development' ? true : [],
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
