// api-gateway/outbound/servicenow/servicenow-outbound.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServiceNowOutboundController } from './servicenow-outbound.controller';
import { OutboundResilienceModule } from '../outbound-resilience.module';

/**
 * Módulo proxy hacia integration-service para operaciones de ServiceNow.
 *
 * El tráfico de ServiceNow (creación, actualización, cierre, consulta de estado)
 * se enruta a través de integration-service, que aplica su propio circuit-breaker
 * y gestiona la comunicación con api-snowq-service.
 *
 * Variables de entorno:
 *   INTEGRATION_SERVICE_URL   Base URL de integration-service (default: http://localhost:3008)
 *   ABAC_M2M_TOKEN            JWT M2M del api-gateway
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
    controllers: [ServiceNowOutboundController],
})
export class ServiceNowOutboundModule { }
