import { Module, Global } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './winston.config';
import { CorrelationIdService } from './correlation-id.service';
import { LoggerService } from './logger.service';
import { TracingService } from '../monitoring/tracing.service';

@Global()
@Module({
    imports: [
        WinstonModule.forRoot(winstonConfig),
    ],
    providers: [CorrelationIdService, LoggerService, TracingService],
    exports: [WinstonModule, CorrelationIdService, LoggerService, TracingService],
})
export class LoggingModule { }
