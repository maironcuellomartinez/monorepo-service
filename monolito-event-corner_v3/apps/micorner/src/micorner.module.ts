// apps/micorner/micorner.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
// Migraciones consolidadas en una sola (2026-08-31): las 20 migraciones
// incrementales previas nunca corrieron fuera de development (donde
// synchronize=true construye el schema directo desde las entidades, así
// que en la práctica casi nunca se ejecutaban) — sin despliegue real en
// staging/producción, no había ninguna DB externa con esas migraciones
// ya registradas en su tabla `migrations` que este squash pudiera romper.
// InitialSchema1788194786468 crea el schema completo actual desde cero
// (generada con `migration:generate` contra las entidades + issue_sequences
// a mano, que es SQL crudo y no un @Entity()) y se verificó columna por
// columna contra la DB de dev existente antes de reemplazar las 20.
import { InitialSchema1788194786468 } from './infrastructure/persistence/typeorm/migrations/1788194786468-InitialSchema';

@Module({
  imports: [
    // Va primero: TypeOrmModule.forRootAsync (abajo) depende de ConfigService
    // para leer DB_HOST/DB_PORT/etc — antes TypeOrmModule.forRoot() era un
    // objeto literal que leía process.env directamente y se evaluaba al
    // construir este array, ANTES de que ConfigModule cargara
    // apps/micorner/.env.<env>. En dev nunca se notó porque los defaults
    // hardcodeados coincidían por casualidad con los valores reales del
    // .env (localhost/root/root/event_corner) — cambiar esas variables en
    // el .env no tenía ningún efecto real.
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USERNAME', 'root'),
        password: config.get<string>('DB_PASSWORD', 'root'),
        database: config.get<string>('DB_DATABASE', 'event_corner'),
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
        // para staging Y producción; las migraciones (migrationsRun más abajo)
        // son las que deben gobernar el schema fuera de dev.
        synchronize: config.get<string>('SYNCHRONIZE_DATABASE') === 'true',
        dropSchema: false,
        logging: false,
        // Sin esto, mysql2 usa su default y con replicas>1 el total de
        // conexiones contra la misma instancia MySQL queda sin acotar por
        // diseño. Mismo valor que api-snowq-service — ajustar con datos reales
        // de tráfico si hace falta.
        extra: { connectionLimit: 10 },
        migrations: [
          InitialSchema1788194786468,
        ],
        // Antes corría siempre, incluso en dev — synchronize ya deja el schema
        // al día ahí, así que migrationsRun competía con synchronize en cada
        // boot por las mismas tablas (motivo por el que había que reconciliar
        // a mano la tabla `migrations` al consolidar en una sola). Ahora es
        // el espejo exacto de synchronize: en dev corre synchronize y nunca
        // migraciones; en staging/prod corren las migraciones y nunca synchronize.
        migrationsRun: config.get<string>('SYNCHRONIZE_DATABASE') !== 'true',
      }),
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
