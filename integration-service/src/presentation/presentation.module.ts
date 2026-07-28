import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './controllers/health.controller';
import { MinervaController } from './controllers/minerva.controller';
import { DroppointController } from './controllers/droppoint.controller';
import { ExternalModule } from '../infrastructure/external/external.module';
import { LoggingModule } from '../infrastructure/logging/logging.module';
import { InternalTokenGuard } from 'src/shared/guards/internal-token.guard';
import { MetricsController } from './controllers';

@Global()
@Module({
    imports: [
        ConfigModule,
        TerminusModule,
        ExternalModule,
        LoggingModule,
    ],
    controllers: [
        HealthController,
        MetricsController,
        MinervaController,
        DroppointController,
    ],
    providers: [
        InternalTokenGuard,
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class PresentationModule { }
