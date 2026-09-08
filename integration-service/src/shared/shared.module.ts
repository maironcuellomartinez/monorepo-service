// src/shared/shared.module.ts
import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { InternalTokenGuard } from './guards/internal-token.guard';

/**
 * Concentra lo que de verdad comparten todas las integraciones: el cliente
 * HTTP preconfigurado (@nestjs/axios) y el guard M2M. Reemplaza a
 * ExternalModule + PresentationModule — ninguno de los dos tenía razón de
 * ser como módulos separados una vez que domain/ y el registry se borraron.
 */
@Global()
@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                timeout: configService.get('http.timeout', 10000),
                maxRedirects: configService.get('http.maxRedirects', 5),
                headers: {
                    'User-Agent': `IntegrationService/${process.env.npm_package_version || '1.0.0'}`,
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [
        InternalTokenGuard,
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
    exports: [HttpModule, InternalTokenGuard],
})
export class SharedModule { }
