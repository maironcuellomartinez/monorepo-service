import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnowRequestEntity } from './entities/snow-request.entity';
import { SnowRequestLog } from './entities/snow-request-log.entity';
import { SnowRequestService } from './services/snow-request.service';
import { SnowRequestProcessingService } from './services/snow-request-processing.service';
import { SnowRequestQueueService } from './services/snow-request-queue.service';
import { SnowRequestWorkerService } from './services/snow-request-worker.service';
import { SnowRequestQueueController } from './controllers/snow-request-queue.controller';
import { SnowRequestImmediateController } from './controllers/snow-request-immediate.controller';
import { DatabaseModule } from 'src/database/database.module';
import { ServiceNowModule } from 'src/servicenow/servicenow.module';
@Module({
    imports: [
        DatabaseModule,
        TypeOrmModule.forFeature([SnowRequestEntity, SnowRequestLog]),
        ServiceNowModule,        // provee SnowRequestProcessorFactory + todos los processors + ServiceNow
    ],
    controllers: [SnowRequestQueueController, SnowRequestImmediateController],
    providers: [
        SnowRequestService,
        SnowRequestProcessingService,
        SnowRequestQueueService,
        SnowRequestWorkerService,
        // CorrelationIdService y LoggerService provistos globalmente por CommonModule
    ],
    exports: [SnowRequestService, SnowRequestProcessingService, SnowRequestQueueService],
})
export class SnowRequestsModule { }
