// internal-api/internal-api.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from '@app/shared/filters/http-exception.filter';
import { InternalTokenGuard } from './guards/internal-token.guard';
import { InternalIncidentsController } from './incidents/internal-incidents.controller';
import { InternalCornersController } from './corners/internal-corners.controller';
import { InternalAvailabilityController } from './availability/internal-availability.controller';
import { InternalRequestsController } from './requests/internal-requests.controller';
import { InternalDevicesController } from './devices/internal-devices.controller';
import { InternalIssueTypesController } from './issue-types/internal-issue-types.controller';
import { InternalCompanyIssueConfigsController } from './corner-issue-configs/internal-corner-issue-configs.controller';
import { InternalServiceNowGroupsController } from './servicenow-groups/internal-servicenow-groups.controller';
import { InternalUsersController } from './users/internal-users.controller';
import { InternalTechniciansController } from './technicians/internal-technicians.controller';
import { InternalCompaniesController } from './companies/internal-companies.controller';
import { InternalIssueTypeTreesController } from './issue-type-trees/internal-issue-type-trees.controller';
import { InternalBatchDraftsController } from './batch-drafts/internal-batch-drafts.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchDraftEntity } from '../infrastructure/persistence/typeorm/entities/batch-draft.entity';
import { BatchDraftItemEntity } from '../infrastructure/persistence/typeorm/entities/batch-draft-item.entity';
import { TypeOrmBatchDraftRepository } from '../infrastructure/persistence/typeorm/repositories/batch-draft.repository';
import { BatchDraftService } from '../core/services/batch-draft/batch-draft.service';

/**
 * Expone la API interna del monolito en /internal/*.
 * Solo accesible desde el API Gateway — nunca exponer a internet.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([BatchDraftEntity, BatchDraftItemEntity]),
    ],
    controllers: [
        InternalIncidentsController,
        InternalCornersController,
        InternalAvailabilityController,
        InternalRequestsController,
        InternalDevicesController,
        InternalIssueTypesController,
        InternalCompanyIssueConfigsController,
        InternalServiceNowGroupsController,
        InternalUsersController,
        InternalTechniciansController,
        InternalCompaniesController,
        InternalIssueTypeTreesController,
        InternalBatchDraftsController,
    ],
    providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: InternalTokenGuard },
        TypeOrmBatchDraftRepository,
        BatchDraftService,
    ],
})
export class InternalApiModule { }
