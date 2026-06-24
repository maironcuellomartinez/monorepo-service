import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SnowRequestProcessorFactory } from './processor.factory';
import { RequestType } from 'src/common';
import { IncidentProcessor } from './strategies/incident.strategy';
import { ChangeRequestProcessor } from './strategies/change-request.strategy';
import { ServiceCatalogProcessor } from './strategies/service-catalog.strategy';
import { ProblemProcessor } from './strategies/problem.strategy';
import { KnowledgeArticleProcessor } from './strategies/knowledge-article.strategy';
import { ReleaseTaskProcessor } from './strategies/release-task.strategy';
import { ConfigurationItemProcessor } from './strategies/configuration-item.strategy';

const mockProcessor = () => ({ process: jest.fn() });

describe('SnowRequestProcessorFactory', () => {
    let factory: SnowRequestProcessorFactory;
    let incidentProcessor: IncidentProcessor;
    let changeRequestProcessor: ChangeRequestProcessor;
    let serviceCatalogProcessor: ServiceCatalogProcessor;
    let problemProcessor: ProblemProcessor;
    let knowledgeArticleProcessor: KnowledgeArticleProcessor;
    let releaseTaskProcessor: ReleaseTaskProcessor;
    let configurationItemProcessor: ConfigurationItemProcessor;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SnowRequestProcessorFactory,
                { provide: IncidentProcessor, useValue: mockProcessor() },
                { provide: ChangeRequestProcessor, useValue: mockProcessor() },
                { provide: ServiceCatalogProcessor, useValue: mockProcessor() },
                { provide: ProblemProcessor, useValue: mockProcessor() },
                { provide: KnowledgeArticleProcessor, useValue: mockProcessor() },
                { provide: ReleaseTaskProcessor, useValue: mockProcessor() },
                { provide: ConfigurationItemProcessor, useValue: mockProcessor() },
            ],
        }).compile();

        factory = module.get<SnowRequestProcessorFactory>(SnowRequestProcessorFactory);
        incidentProcessor = module.get<IncidentProcessor>(IncidentProcessor);
        changeRequestProcessor = module.get<ChangeRequestProcessor>(ChangeRequestProcessor);
        serviceCatalogProcessor = module.get<ServiceCatalogProcessor>(ServiceCatalogProcessor);
        problemProcessor = module.get<ProblemProcessor>(ProblemProcessor);
        knowledgeArticleProcessor = module.get<KnowledgeArticleProcessor>(KnowledgeArticleProcessor);
        releaseTaskProcessor = module.get<ReleaseTaskProcessor>(ReleaseTaskProcessor);
        configurationItemProcessor = module.get<ConfigurationItemProcessor>(ConfigurationItemProcessor);
    });

    describe('getProcessor()', () => {
        it('debería retornar IncidentProcessor para RequestType.INCIDENT', () => {
            const processor = factory.getProcessor(RequestType.INCIDENT);
            expect(processor).toBe(incidentProcessor);
        });

        it('debería retornar ChangeRequestProcessor para RequestType.CHANGE_REQUEST', () => {
            const processor = factory.getProcessor(RequestType.CHANGE_REQUEST);
            expect(processor).toBe(changeRequestProcessor);
        });

        it('debería retornar ServiceCatalogProcessor para RequestType.SERVICE_CATALOG', () => {
            const processor = factory.getProcessor(RequestType.SERVICE_CATALOG);
            expect(processor).toBe(serviceCatalogProcessor);
        });

        it('debería retornar ProblemProcessor para RequestType.PROBLEM', () => {
            const processor = factory.getProcessor(RequestType.PROBLEM);
            expect(processor).toBe(problemProcessor);
        });

        it('debería retornar KnowledgeArticleProcessor para RequestType.KNOWLEDGE_ARTICLE', () => {
            const processor = factory.getProcessor(RequestType.KNOWLEDGE_ARTICLE);
            expect(processor).toBe(knowledgeArticleProcessor);
        });

        it('debería retornar ReleaseTaskProcessor para RequestType.RELEASE_TASK', () => {
            const processor = factory.getProcessor(RequestType.RELEASE_TASK);
            expect(processor).toBe(releaseTaskProcessor);
        });

        it('debería retornar ConfigurationItemProcessor para RequestType.CONFIGURATION_ITEM', () => {
            const processor = factory.getProcessor(RequestType.CONFIGURATION_ITEM);
            expect(processor).toBe(configurationItemProcessor);
        });

        it('debería lanzar NotFoundException para un tipo de solicitud desconocido', () => {
            expect(() => factory.getProcessor('unknown_type' as RequestType)).toThrow(NotFoundException);
        });

        it('debería incluir el tipo desconocido en el mensaje de la excepción', () => {
            expect(() => factory.getProcessor('bad_type' as RequestType)).toThrow(
                /Tipo de solicitud no soportado: bad_type/,
            );
        });
    });
});
