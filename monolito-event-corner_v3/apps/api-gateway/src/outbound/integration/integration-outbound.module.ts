import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntegrationOutboundController } from './integration-outbound.controller';
import { OutboundResilienceModule } from '../outbound-resilience.module';

/**
 * Módulo proxy hacia integration-service (:3008).
 *
 * Reenvía requests internos del monolito hacia integration-service.
 * integration-service valida JWT M2M (Authorization: Bearer) emitido por ABAC.
 *
 * Variables de entorno:
 *   INTEGRATION_SERVICE_URL   Base URL de integration-service (default: http://localhost:3008)
 *   ABAC_M2M_TOKEN            JWT M2M del api-gateway para llamadas internas
 */
@Module({
    imports: [
        ConfigModule,
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService) => ({
                baseURL: config.get('INTEGRATION_SERVICE_URL', 'http://localhost:3008'),
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            }),
            inject: [ConfigService],
        }),
        OutboundResilienceModule,
    ],
    controllers: [IntegrationOutboundController],
})
export class IntegrationOutboundModule {}
