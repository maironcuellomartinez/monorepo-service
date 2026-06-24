import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ServiceNowService } from './servicenow.service';
import { CircuitBreakerModule } from 'src/resilience/circuit-breaker';
import { ServiceNowBreakerFactory } from './client/servicenow-breaker.factory';
import { ServiceNowClientService } from './client/servicenow-client.service';
import { ServiceNowErrorFactory } from './client/servicenow-error.factory';
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
