import * as dotenv from 'dotenv';
import * as path from 'path';

// Carga .env.<NODE_ENV> antes de que NestJS inicialice cualquier módulo
const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AuditInterceptor } from './abac/interceptors/audit.interceptor';
import { prometheusRegistry } from './observability/services/metrics/prometheus.metrics';
import { LoggerService } from './observability/services/logger.service';

function validateConfig(): void {
    if (env === 'development') return;

    const required: Record<string, string> = {
        JWT_SECRET: 'Secret para firmar JWT — debe coincidir con api-gateway',
        DB_HOST: 'Host de la base de datos MySQL',
        DB_USERNAME: 'Usuario de la base de datos',
        DB_PASSWORD: 'Contraseña de la base de datos',
        REDIS_URL: 'URL de Redis para caché de permisos y API keys',
    };

    const invalid = Object.entries(required).filter(
        ([key]) => !process.env[key] || process.env[key]!.startsWith('CHANGE_ME'),
    );

    if (invalid.length > 0) {
        const lines = invalid.map(([key, desc]) => `  • ${key} — ${desc}`).join('\n');
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
    app.enableShutdownHooks();
    const logger = new Logger('Bootstrap');

    // CORS: abierto en development, restringido a orígenes explícitos en staging/production
    const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean);
    app.enableCors(
        env === 'development'
            ? { origin: true, credentials: true }
            : { origin: corsOrigins ?? [], credentials: true },
    );

    app.use(helmet());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

    // ── Swagger: solo en entornos no productivos ──────────────────────────────
    if (env !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('ABAC Microservice API')
            .setDescription('Attribute-Based Access Control — Event Corner')
            .setVersion('1.0')
            .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
            .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
            .addTag('Auth', 'Autenticación — Admin login, M2M, OAuth2, Entra ID')
            .addTag('ABAC', 'Evaluación de acceso')
            .addTag('Users', 'Gestión de usuarios')
            .addTag('Applications', 'Aplicaciones registradas')
            .addTag('Roles', 'Roles y permisos')
            .addTag('Policies', 'Políticas de acceso')
            .addTag('Audit', 'Auditoría de accesos')
            .addTag('Health', 'Estado del servicio')
            .build();

        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api-docs', app, document);
        logger.log('Swagger disponible en /api-docs');
    }

    // ── Prometheus /metrics endpoint ─────────────────────────────────────────
    app.use('/metrics', async (_req: any, res: any) => {
        res.setHeader('Content-Type', prometheusRegistry.contentType);
        res.end(await prometheusRegistry.metrics());
    });

    // ── Global interceptors ──────────────────────────────────────────────────
    app.useGlobalInterceptors(app.get(AuditInterceptor));

    const port = parseInt(process.env.PORT ?? '3005') || 3005;
    await app.listen(port);
    logger.log(`abac-microservice [${env}] corriendo en puerto ${port}`);
}

bootstrap();
