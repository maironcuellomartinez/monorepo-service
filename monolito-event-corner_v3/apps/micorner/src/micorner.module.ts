// apps/micorner/micorner.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { micornerEnvSchema } from './config/env.validation';
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
import { MicornerReconcilerJob } from './infrastructure/jobs/micorner-reconciler.job';
import { SnowOrphanRecoveryJob } from './infrastructure/jobs/snow-orphan-recovery.job';
import { SlotHoldCleanupJob } from './infrastructure/jobs/slot-hold-cleanup.job';
import { JobsModule } from './infrastructure/jobs/jobs.module';
import { ServiceNowProfileEntity } from './infrastructure/persistence/typeorm/entities/servicenow-profile.entity';
import { CompanyEntity } from './infrastructure/persistence/typeorm/entities/company.entity';
import { IssueTypeEntity } from './infrastructure/persistence/typeorm/entities/issue-type.entity';
import { IssueTypeTreeEntity } from './infrastructure/persistence/typeorm/entities/issue-type-tree.entity';
import { CornerEntity } from './infrastructure/persistence/typeorm/entities/corner.entity';
import { CornerScheduleEntity } from './infrastructure/persistence/typeorm/entities/corner-schedule.entity';
import { ScheduleAssignmentEntity } from './infrastructure/persistence/typeorm/entities/schedule-assignment.entity';
import { TechnicianEntity } from './infrastructure/persistence/typeorm/entities/technician.entity';
import { CornerSlotEntity } from './infrastructure/persistence/typeorm/entities/corner-slot.entity';
import { UserEntity } from './infrastructure/persistence/typeorm/entities/user.entity';
import { DeviceEntity } from './infrastructure/persistence/typeorm/entities/device.entity';
import { LockerEntity } from './infrastructure/persistence/typeorm/entities/locker.entity';
import { AppointmentEntity } from './infrastructure/persistence/typeorm/entities/appointment.entity';
import { AppointmentSlotEntity } from './infrastructure/persistence/typeorm/entities/appointment-slot.entity';
import { AppointmentTimelineEntity } from './infrastructure/persistence/typeorm/entities/appointment-timeline.entity';
import { ServiceNowTicketLinkEntity } from './infrastructure/persistence/typeorm/entities/servicenow-ticket-link.entity';
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
import { AddSnClassificationToIssueTypes1784600000000 } from './infrastructure/persistence/typeorm/migrations/1784600000000-AddSnClassificationToIssueTypes';
import { AddCodeToCorners1784700000000 } from './infrastructure/persistence/typeorm/migrations/1784700000000-AddCodeToCorners';
import { AddIncrementalIssueIdToIncidentsAndRequests1784800000000 } from './infrastructure/persistence/typeorm/migrations/1784800000000-AddIncrementalIssueIdToIncidentsAndRequests';
import { AddEstimatedCloseToIncidents1784900000000 } from './infrastructure/persistence/typeorm/migrations/1784900000000-AddEstimatedCloseToIncidents';
import { WidenIncidentTimelineActionType1785000000000 } from './infrastructure/persistence/typeorm/migrations/1785000000000-WidenIncidentTimelineActionType';
import { CreateAppointmentsTable1785100000000 } from './infrastructure/persistence/typeorm/migrations/1785100000000-CreateAppointmentsTable';
import { CreateAppointmentSlotsTable1785200000000 } from './infrastructure/persistence/typeorm/migrations/1785200000000-CreateAppointmentSlotsTable';
import { CreateServicenowTicketLinksTable1785300000000 } from './infrastructure/persistence/typeorm/migrations/1785300000000-CreateServicenowTicketLinksTable';
import { CreateAppointmentTimelineTable1785400000000 } from './infrastructure/persistence/typeorm/migrations/1785400000000-CreateAppointmentTimelineTable';
import { BackfillAppointmentsFromIncidentsAndRequests1785500000000 } from './infrastructure/persistence/typeorm/migrations/1785500000000-BackfillAppointmentsFromIncidentsAndRequests';
import { DropIncidentsAndRequestsLegacyTables1785600000000 } from './infrastructure/persistence/typeorm/migrations/1785600000000-DropIncidentsAndRequestsLegacyTables';
import { RenamePrincipalNameToUpnOnUsers1785700000000 } from './infrastructure/persistence/typeorm/migrations/1785700000000-RenamePrincipalNameToUpnOnUsers';
import { MakeCompaniesTreeIdNullable1785800000000 } from './infrastructure/persistence/typeorm/migrations/1785800000000-MakeCompaniesTreeIdNullable';
import { FixDevicesLastSyncAtColumnType1785900000000 } from './infrastructure/persistence/typeorm/migrations/1785900000000-FixDevicesLastSyncAtColumnType';

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
        UserEntity,
        DeviceEntity,
        LockerEntity,
        AppointmentEntity,
        AppointmentSlotEntity,
        AppointmentTimelineEntity,
        ServiceNowTicketLinkEntity,
        OutboxEventEntity,
        CompanyIssueConfigEntity,
        ServiceNowGroupEntity,
        BatchDraftEntity,
        BatchDraftItemEntity,
      ],
      // Antes `NODE_ENV !== 'production'`, así que staging también quedaba
      // con synchronize=true — CLAUDE.md documenta SYNCHRONIZE_DATABASE=false
      // para staging Y producción; las migraciones (migrationsRun: true más
      // abajo) son las que deben gobernar el schema fuera de dev.
      synchronize: process.env.SYNCHRONIZE_DATABASE === 'true',
      dropSchema: false,
      logging: false,
      // Sin esto, mysql2 usa su default y con replicas>1 el total de
      // conexiones contra la misma instancia MySQL queda sin acotar por
      // diseño. Mismo valor que api-snowq-service — ajustar con datos reales
      // de tráfico si hace falta.
      extra: { connectionLimit: 10 },
      migrations: [
        DropCornerSlotsFKForResync1745088000000,
        IncreaseOutboxMaxRetries1783641799581,
        AddUniqueSnowCompanySysIdToServiceNowProfiles1784324876162,
        WidenSnowqCorrelationIdColumns1784384307249,
        AddUniqueWindowToCornerSlots1784389154861,
        WidenIncidentOriginChannel1784481206018,
        AddSnClassificationToIssueTypes1784600000000,
        AddCodeToCorners1784700000000,
        AddIncrementalIssueIdToIncidentsAndRequests1784800000000,
        AddEstimatedCloseToIncidents1784900000000,
        WidenIncidentTimelineActionType1785000000000,
        CreateAppointmentsTable1785100000000,
        CreateAppointmentSlotsTable1785200000000,
        CreateServicenowTicketLinksTable1785300000000,
        CreateAppointmentTimelineTable1785400000000,
        BackfillAppointmentsFromIncidentsAndRequests1785500000000,
        DropIncidentsAndRequestsLegacyTables1785600000000,
        RenamePrincipalNameToUpnOnUsers1785700000000,
        MakeCompaniesTreeIdNullable1785800000000,
        FixDevicesLastSyncAtColumnType1785900000000,
      ],
      migrationsRun: true,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          'apps/micorner',
          `.env.${process.env.NODE_ENV ?? 'development'}`,
        ),
        path.resolve(process.cwd(), 'apps/micorner', '.env'),
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
      validationSchema: micornerEnvSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    ScheduleModule.forRoot(),
    HttpModule,
    ObservabilityModule.forRoot({ serviceName: 'micorner' }),
    SharedModule,
    InfrastructureModule,
    CoreServicesModule,
    EventHandlersModule,
    InternalApiModule,
    HealthModule,
    JobsModule,
  ],
  providers: [
    DeviceSyncJob,
    MicornerReconcilerJob,
    SnowOrphanRecoveryJob,
    SlotHoldCleanupJob,
  ],
})
export class MicornerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
