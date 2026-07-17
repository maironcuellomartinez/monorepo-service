import { Module } from '@nestjs/common';
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
      useFactory: (): ServiceNowOAuthConfig => ({
        oauthUrl: process.env.SN_OAUTH_URL ?? '',
        upn: process.env.SN_OAUTH_UPN ?? '',
        kid: process.env.SN_OAUTH_KID ?? '',
        clientId: process.env.SN_OAUTH_CLIENT_ID ?? '',
        secretId: process.env.SN_OAUTH_CLIENT_SECRET ?? '',
        iss: process.env.SN_OAUTH_ISS ?? '',
        grantType:
          process.env.SN_OAUTH_GRANT_TYPE ??
          'urn:ietf:params:oauth:grant-type:jwt-bearer',
        authCert: process.env.SN_OAUTH_CERT_PATH ?? '',
      }),
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
