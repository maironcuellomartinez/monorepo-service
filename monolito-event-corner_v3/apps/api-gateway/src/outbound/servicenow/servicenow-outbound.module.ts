// api-gateway/outbound/servicenow/servicenow-outbound.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServiceNowOutboundController } from './servicenow-outbound.controller';
import { ServiceNowCatalogClient } from './servicenow-catalog.client';
import { OutboundResilienceModule } from '../outbound-resilience.module';

/**
 * Módulo proxy hacia api-snowq-service para operaciones de ServiceNow.
 *
 * Único egress hacia ServiceNow del ecosistema: monolith → gateway (este módulo)
 * → api-snowq-service → ServiceNow. integration-service ya no interviene en este flujo.
 *
 * Variables de entorno:
 *   SNOWQ_URL        Base URL de api-snowq-service (default: http://localhost:3090)
 *   ABAC_M2M_TOKEN   JWT M2M del api-gateway (Ed25519, verificado por M2mJwtGuard en snowq)
 */
@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get('SNOWQ_URL', 'http://localhost:3090'),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }),
      inject: [ConfigService],
    }),
    OutboundResilienceModule,
  ],
  controllers: [ServiceNowOutboundController],
  providers: [ServiceNowCatalogClient],
  exports: [ServiceNowCatalogClient],
})
export class ServiceNowOutboundModule {}
