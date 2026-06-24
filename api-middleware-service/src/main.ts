import * as dotenv from 'dotenv';
import * as path from 'path';

// Carga .env.<NODE_ENV> antes de que NestJS inicialice cualquier modulo
const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import helmet from 'helmet';
import compression from 'compression';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const logger = new Logger('Bootstrap');

    // En staging/prod Apache termina TLS y reenvía HTTP a localhost:3007.
    // "trust proxy" permite leer X-Forwarded-Proto / X-Real-IP correctamente.
    if (env !== 'development') {
        app.getHttpAdapter().getInstance().set('trust proxy', 1);
    }

    // Seguridad: helmet protege contra vulnerabilidades HTTP comunes
    app.use(helmet());

    // Rendimiento: compression gzip para respuestas
    app.use(compression());

    // Rechazar requests que no vengan por HTTPS en staging/prod.
    // Apache inyecta X-Forwarded-Proto: https — si no está presente o es http,
    // alguien está accediendo directamente al puerto 3007 sin pasar por TLS.
    if (env !== 'development') {
        app.use((req: any, res: any, next: () => void) => {
            const proto = req.headers['x-forwarded-proto'];
            if (proto !== 'https') {
                return res.status(426).json({
                    statusCode: 426,
                    error: 'Upgrade Required',
                    message: 'Se requiere HTTPS. Conectate a través del proxy seguro.',
                });
            }
            next();
        });
    }

    // CORS: en development usa CORS_DEV_ORIGINS o el fallback local; en prod usa CORS_ALLOWED_ORIGINS
    const corsOrigins = env === 'development'
        ? (process.env.CORS_DEV_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)
            ?? ['http://localhost:5173', 'http://localhost:3000'])
        : process.env.CORS_ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? [];
    app.enableCors({ origin: corsOrigins, credentials: true });

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

    // Swagger solo en entornos no productivos
    if (env !== 'production') {
        const builder = new DocumentBuilder()
            .setTitle('API Middleware Service')
            .setDescription('Proxy OAuth2 para aplicaciones externas → Event Corner')
            .setVersion('1.0')
            .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
            .addApiKey({ type: 'apiKey', name: 'x-admin-api-key', in: 'header' }, 'admin-key')
            .addTag('Auth', 'OAuth2 client credentials')
            .addTag('Clients', 'Gestion de aplicaciones externas registradas')
            .addTag('Records', 'Consulta de solicitudes')
            .addTag('Health', 'Estado del servicio — sin autenticacion');

        // En staging/prod el proxy Apache sirve la API bajo un sub-path (ej: /r/api).
        // Swagger necesita conocer ese prefijo para que los curl/Try-it-out apunten
        // a la URL correcta. Configurable via SWAGGER_BASE_PATH en el .env.
        const swaggerBasePath = process.env.SWAGGER_BASE_PATH;
        if (swaggerBasePath) {
            builder.addServer(swaggerBasePath);
        }

        const document = SwaggerModule.createDocument(app, builder.build());
        SwaggerModule.setup('docs', app, document);
        logger.log(`Swagger disponible en /docs${swaggerBasePath ? ` (server: ${swaggerBasePath})` : ''}`);
    }

    const port = process.env.PORT ?? 3007;
    await app.listen(port);
    logger.log(`api-middleware-service [${env}] corriendo en puerto ${port}`);
}
bootstrap();
 