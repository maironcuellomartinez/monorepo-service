import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceNowService } from './servicenow.service';
import { CircuitBreakerModule } from 'src/resilience/circuit-breaker';
import { ServiceNowBreakerFactory } from './client/servicenow-breaker.factory';
import { ServiceNowClientService } from './client/servicenow-client.service';
import { ServiceNowErrorFactory } from './client/servicenow-error.factory';
import {
  SN_OAUTH_CONFIG,
  ServiceNowOAuthConfig,
  ServiceNowTokenService,
} from './client/servicenow-token.service';
import { SnowRequestProcessorFactory } from './processors/processor.factory';
import {
  ChangeRequestProcessor,
  ConfigurationItemProcessor,
  IncidentProcessor,
  KnowledgeArticleProcessor,
  ProblemProcessor,
  ReleaseTaskProcessor,
  ServiceCatalogProcessor,
} from './processors/strategies';

@Module({
  imports: [CircuitBreakerModule],
  providers: [
    ServiceNowService,
    ServiceNowErrorFactory,
    ServiceNowBreakerFactory,
    ServiceNowClientService,
    ServiceNowTokenService,
    {
      provide: SN_OAUTH_CONFIG,
      useFactory: (configService: ConfigService): ServiceNowOAuthConfig => ({
        oauthUrl: configService.get<string>('servicenow.oauth_url') ?? '',
        upn: configService.get<string>('servicenow.oauth_upn') ?? '',
        kid: configService.get<string>('servicenow.oauth_kid') ?? '',
        clientId: configService.get<string>('servicenow.oauth_client_id') ?? '',
        secretId:
          configService.get<string>('servicenow.oauth_client_secret') ?? '',
        iss: configService.get<string>('servicenow.oauth_iss') ?? '',
        grantType:
          configService.get<string>('servicenow.oauth_grant_type') ??
          'urn:ietf:params:oauth:grant-type:jwt-bearer',
        authCert: configService.get<string>('servicenow.oauth_cert_path') ?? '',
      }),
      inject: [ConfigService],
    },
    SnowRequestProcessorFactory,
    IncidentProcessor,
    ChangeRequestProcessor,
    ServiceCatalogProcessor,
    ProblemProcessor,
    KnowledgeArticleProcessor,
    ReleaseTaskProcessor,
    ConfigurationItemProcessor,
  ],
  exports: [
    ServiceNowService,
    SnowRequestProcessorFactory,
    ServiceNowClientService,
  ],
})
export class ServiceNowModule {}
