// apps/monolith/monolith.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { SharedModule } from '@app/shared/shared.module';
import {
  ObservabilityModule,
  CorrelationMiddleware as CorrelationMiddleware,
} from '@app/observability';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { CoreServicesModule } from './core/services/core-services.module';
import { InternalApiModule } from './internal-api/internal-api.module';
import { HealthModule } from './health/health.module';
import { EventHandlersModule } from './infrastructure/event-handlers/event-handlers.module';
import { DeviceSyncJob } from './infrastructure/jobs/device-sync.job';
import { MonolithReconcilerJob } from './infrastructure/jobs/monolith-reconciler.job';
import { SnowSyncJob } from './infrastructure/jobs/snow-sync.job';
import { SnowOrphanRecoveryJob } from './infrastructure/jobs/snow-orphan-recovery.job';
import { SlotHoldCleanupJob } from './infrastructure/jobs/slot-hold-cleanup.job';
import { SnCompanySyncJob } from './infrastructure/jobs/sn-company-sync.job';
import { ServiceNowProfileEntity } from './infrastructure/persistence/typeorm/entities/servicenow-profile.entity';
import { CompanyEntity } from './infrastructure/persistence/typeorm/entities/company.entity';
import { IssueTypeEntity } from './infrastructure/persistence/typeorm/entities/issue-type.entity';
import { IssueTypeTreeEntity } from './infrastructure/persistence/typeorm/entities/issue-type-tree.entity';
import { CornerEntity } from './infrastructure/persistence/typeorm/entities/corner.entity';
import { CornerScheduleEntity } from './infrastructure/persistence/typeorm/entities/corner-schedule.entity';
import { ScheduleAssignmentEntity } from './infrastructure/persistence/typeorm/entities/schedule-assignment.entity';
import { TechnicianEntity } from './infrastructure/persistence/typeorm/entities/technician.entity';
import { CornerSlotEntity } from './infrastructure/persistence/typeorm/entities/corner-slot.entity';
import { IncidentEntity } from './infrastructure/persistence/typeorm/entities/incident.entity';
import { IncidentSlotEntity } from './infrastructure/persistence/typeorm/entities/incident-slot.entity';
import { IncidentTimelineEntity } from './infrastructure/persistence/typeorm/entities/incident-timeline.entity';
import { UserEntity } from './infrastructure/persistence/typeorm/entities/user.entity';
import { DeviceEntity } from './infrastructure/persistence/typeorm/entities/device.entity';
import { LockerEntity } from './infrastructure/persistence/typeorm/entities/locker.entity';
import { RequestEntity } from './infrastructure/persistence/typeorm/entities/request.entity';
import { RequestActivityEntity } from './infrastructure/persistence/typeorm/entities/request-activity.entity';
import { OutboxEventEntity } from './infrastructure/persistence/typeorm/entities/outbox-event.entity';
import { CompanyIssueConfigEntity } from './infrastructure/persistence/typeorm/entities/corner-issue-config.entity';
import { ServiceNowGroupEntity } from './infrastructure/persistence/typeorm/entities/servicenow-group.entity';
import { BatchDraftEntity } from './infrastructure/persistence/typeorm/entities/batch-draft.entity';
import { BatchDraftItemEntity } from './infrastructure/persistence/typeorm/entities/batch-draft-item.entity';
import { DropCornerSlotsFKForResync1745088000000 } from './infrastructure/persistence/typeorm/migrations/1745088000000-DropCornerSlotsFKForResync';
import { IncreaseOutboxMaxRetries1783641799581 } from './infrastructure/persistence/typeorm/migrations/1783641799581-IncreaseOutboxMaxRetries';
import { AddUniqueSnowCompanySysIdToServiceNowProfiles1784324876162 } from './infrastructure/persistence/typeorm/migrations/1784324876162-AddUniqueSnowCompanySysIdToServiceNowProfiles';
import { WidenSnowqCorrelationIdColumns1784384307249 } from './infrastructure/persistence/typeorm/migrations/1784384307249-WidenSnowqCorrelationIdColumns';
import { AddUniqueWindowToCornerSlots1784389154861 } from './infrastructure/persistence/typeorm/migrations/1784389154861-AddUniqueWindowToCornerSlots';
import { WidenIncidentOriginChannel1784481206018 } from './infrastructure/persistence/typeorm/migrations/1784481206018-WidenIncidentOriginChannel';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '3306'),
      username: process.env.DB_USERNAME ?? 'root',
      password: process.env.DB_PASSWORD ?? 'root',
      database: process.env.DB_DATABASE ?? 'event_corner',
      entities: [
        ServiceNowProfileEntity,
        CompanyEntity,
        IssueTypeEntity,
        IssueTypeTreeEntity,
        CornerEntity,
        CornerScheduleEntity,
        ScheduleAssignmentEntity,
        TechnicianEntity,
        CornerSlotEntity,
        IncidentEntity,
        IncidentSlotEntity,
        IncidentTimelineEntity,
        UserEntity,
        DeviceEntity,
        LockerEntity,
        RequestEntity,
        RequestActivityEntity,
        OutboxEventEntity,
        CompanyIssueConfigEntity,
        ServiceNowGroupEntity,
        BatchDraftEntity,
        BatchDraftItemEntity,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      dropSchema: false,
      logging: false,
      migrations: [
        DropCornerSlotsFKForResync1745088000000,
        IncreaseOutboxMaxRetries1783641799581,
        AddUniqueSnowCompanySysIdToServiceNowProfiles1784324876162,
        WidenSnowqCorrelationIdColumns1784384307249,
        AddUniqueWindowToCornerSlots1784389154861,
        WidenIncidentOriginChannel1784481206018,
      ],
      migrationsRun: true,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          'apps/monolith',
          `.env.${process.env.NODE_ENV ?? 'development'}`,
        ),
        path.resolve(process.cwd(), 'apps/monolith', '.env'),
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
    }),
    ScheduleModule.forRoot(),
    HttpModule,
    ObservabilityModule.forRoot({ serviceName: 'monolith' }),
    SharedModule,
    InfrastructureModule,
    CoreServicesModule,
    EventHandlersModule,
    InternalApiModule,
    HealthModule,
  ],
  providers: [
    DeviceSyncJob,
    MonolithReconcilerJob,
    SnowSyncJob,
    SnowOrphanRecoveryJob,
    SlotHoldCleanupJob,
    SnCompanySyncJob,
  ],
})
export class MonolithModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
