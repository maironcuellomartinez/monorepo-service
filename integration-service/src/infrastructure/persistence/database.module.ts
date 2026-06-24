// src/infrastructure/persistence/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IntegrationEvent } from '../entities/integration-event.entity';
import { ExternalSystem } from '../entities/external-system.entity';

import { IntegrationEventRepository } from './typeorm/repositories/integration-event.repository';
import { ExternalSystemRepository } from './typeorm/repositories/external-system.repository';

@Module({
    imports: [
        TypeOrmModule.forFeature([IntegrationEvent, ExternalSystem]),
    ],
    providers: [
        {
            provide: 'IIntegrationEventRepository',
            useClass: IntegrationEventRepository,
        },
        {
            provide: 'IExternalSystemRepository',
            useClass: ExternalSystemRepository,
        },
    ],
    exports: [
        'IIntegrationEventRepository',
        'IExternalSystemRepository',
        TypeOrmModule,
    ],
})
export class DatabaseModule { }
