import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TerminusModule } from '@nestjs/terminus';
import { IntegrationController } from './controllers/integration.controller';
import { HealthController } from './controllers/health.controller';
import { MinervaController } from './controllers/minerva.controller';
import { DroppointController } from './controllers/droppoint.controller';
import { ProcessAppointmentCreatedUseCase } from '../application/use-cases/process-appointment-created.usecase';
import { DatabaseModule } from '../infrastructure/persistence/database.module';
import { ExternalModule } from '../infrastructure/external/external.module';
import { LoggingModule } from '../infrastructure/logging/logging.module';
import { CircuitBreakerService } from 'src/infrastructure/services';
import { InternalTokenGuard } from 'src/shared/guards/internal-token.guard';
import { MetricsController } from './controllers';
import { StuckEventRecoveryJob } from 'src/infrastructure/jobs/stuck-event-recovery.job';

@Global()
@Module({
    imports: [
        ConfigModule,
        CqrsModule,
        EventEmitterModule,
        TerminusModule,
        DatabaseModule,
        ExternalModule,
        LoggingModule,
    ],
    controllers: [
        IntegrationController,
        HealthController,
        MetricsController,
        MinervaController,
        DroppointController,
    ],
    providers: [
        ProcessAppointmentCreatedUseCase,
        CircuitBreakerService,
        StuckEventRecoveryJob,
        InternalTokenGuard,
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
    exports: [
        ProcessAppointmentCreatedUseCase,
    ],
})
export class PresentationModule { }
