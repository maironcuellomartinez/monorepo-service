// api-gateway/api-gateway.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { HttpClientsModule } from './http/http-clients.module';
import { ClientModule } from './client/client.module';
import { OutboundGatewayModule } from './outbound/outbound-gateway.module';
import { AuthModule } from './auth/auth.module';
import { IncidentsController } from './inbound/incidents/incidents.controller';
import { CornersController } from './inbound/corners/corners.controller';
import { AvailabilityController } from './inbound/availability/availability.controller';
import { IssueTypesController } from './inbound/admin/issue-types.controller';
import { TechniciansController } from './inbound/admin/technicians.controller';
import { RequestsController } from './inbound/requests/requests.controller';
import { AuthController } from './inbound/auth/auth.controller';
import { AbacController } from './inbound/auth/abac.controller';
import { ExternalRecordsController } from './inbound/external/external-records.controller';
import { DevicesController } from './inbound/devices/devices.controller';
import { AdminUsersController } from './inbound/admin/users.controller';
import { AdminCompaniesController } from './inbound/admin/companies.controller';
import { AdminIssueTypeTreesController } from './inbound/admin/issue-type-trees.controller';
import { AdminServiceNowGroupsController } from './inbound/admin/servicenow-groups.controller';
import { AdminServiceNowLocationsController } from './inbound/admin/servicenow-locations.controller';
import { BatchDraftsController } from './inbound/batch-drafts/batch-drafts.controller';
import { ObservabilityModule, CorrelationMiddleware } from '@app/observability';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          'apps/api-gateway',
          `.env.${process.env.NODE_ENV ?? 'development'}`,
        ),
        path.resolve(process.cwd(), 'apps/api-gateway', '.env'),
        `apps/api-gateway/.env.${process.env.NODE_ENV ?? 'development'}`,
        'apps/api-gateway/.env',
      ],
    }),
    ObservabilityModule.forRoot({ serviceName: 'api-gateway' }),
    HttpClientsModule,
    HealthModule,
    ClientModule,
    OutboundGatewayModule,
    AuthModule,
  ],
  controllers: [
    AuthController,
    AbacController,
    IncidentsController,
    CornersController,
    AvailabilityController,
    IssueTypesController,
    TechniciansController,
    RequestsController,
    ExternalRecordsController,
    DevicesController,
    AdminUsersController,
    AdminCompaniesController,
    AdminIssueTypeTreesController,
    AdminServiceNowGroupsController,
    AdminServiceNowLocationsController,
    BatchDraftsController,
  ],
})
export class ApiGatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
