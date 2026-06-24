import { Injectable, NotFoundException } from '@nestjs/common';
import { RequestType } from 'src/common';
import { SnowRequestProcessor } from './processor.interface';
import { IncidentProcessor } from './strategies/incident.strategy';
import { ChangeRequestProcessor } from './strategies/change-request.strategy';
import { ServiceCatalogProcessor } from './strategies/service-catalog.strategy';
import { ProblemProcessor } from './strategies/problem.strategy';
import { KnowledgeArticleProcessor } from './strategies/knowledge-article.strategy';
import { ReleaseTaskProcessor } from './strategies/release-task.strategy';
import { ConfigurationItemProcessor } from './strategies/configuration-item.strategy';

@Injectable()
export class SnowRequestProcessorFactory {
    constructor(
        private readonly incidentProcessor: IncidentProcessor,
        private readonly changeRequestProcessor: ChangeRequestProcessor,
        private readonly serviceCatalogProcessor: ServiceCatalogProcessor,
        private readonly problemProcessor: ProblemProcessor,
        private readonly knowledgeArticleProcessor: KnowledgeArticleProcessor,
        private readonly releaseTaskProcessor: ReleaseTaskProcessor,
        private readonly configurationItemProcessor: ConfigurationItemProcessor,
    ) { }

    /**
     * Obtiene el procesador correspondiente al tipo de solicitud
     * @param type Tipo de solicitud
     * @returns Procesador correspondiente al tipo de solicitud
     * @example
     * ```typescript
     * const processor = this.processorFactory.getProcessor(RequestType.INCIDENT);
     * ```
     * @description This method returns the appropriate processor based on the request type.
     * If the type is not supported, it throws a NotFoundException.
     */
    getProcessor(type: RequestType): SnowRequestProcessor {
        switch (type) {
            case RequestType.INCIDENT:
                return this.incidentProcessor;
            case RequestType.CHANGE_REQUEST:
                return this.changeRequestProcessor;
            case RequestType.SERVICE_CATALOG:
                return this.serviceCatalogProcessor;
            case RequestType.PROBLEM:
                return this.problemProcessor;
            case RequestType.KNOWLEDGE_ARTICLE:
                return this.knowledgeArticleProcessor;
            case RequestType.RELEASE_TASK:
                return this.releaseTaskProcessor;
            case RequestType.CONFIGURATION_ITEM:
                return this.configurationItemProcessor;
            default:
                throw new NotFoundException(`Tipo de solicitud no soportado: ${type}`);
        }
    }
}
