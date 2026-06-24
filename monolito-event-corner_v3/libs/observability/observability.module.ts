import { Global, Module, DynamicModule } from '@nestjs/common';
import { ConfigurableModuleBuilder } from '@nestjs/common';
import { LoggerService } from './services/logger.service';
import { MetricsProducerService } from './services/metrics-producer.service';
import { CorrelationIdService } from './services/correlation-id.service';
import { TracingService } from './services/tracing.service';
import { WinstonHttpTransport } from './transports/winston-http.transport';
import { CorrelationInterceptor } from './interceptors/correlation.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

export interface ObservabilityOptions {
    serviceName: string;
    logLevel?: string;
    logTransportUrl?: string;
    logTransportBatch?: number;
    logTransportFlushInterval?: number;
}

const { ConfigurableModuleClass, OPTIONS_TYPE } = new ConfigurableModuleBuilder<ObservabilityOptions>()
    .setClassMethodName('forRoot')
    .build();

@Global()
@Module({})
export class ObservabilityModule extends ConfigurableModuleClass {
    static forRoot(options: typeof OPTIONS_TYPE): DynamicModule {
        const module = super.forRoot(options);

        // Configurar variables de entorno (no sobrescribir si ya están seteadas en .env)
        process.env.SERVICE_NAME = options.serviceName;
        process.env.LOG_LEVEL = options.logLevel ?? 'info';
        if (options.logTransportUrl) process.env.LOG_TRANSPORT_URL = options.logTransportUrl;
        if (options.logTransportBatch) process.env.LOG_TRANSPORT_BATCH = String(options.logTransportBatch);
        if (options.logTransportFlushInterval) process.env.LOG_TRANSPORT_INTERVAL = String(options.logTransportFlushInterval);

        return {
            ...module,
            global: true,
            imports: [],
            providers: [
                {
                    provide: 'SERVICE_NAME',
                    useValue: options.serviceName,
                },
                CorrelationIdService,
                WinstonHttpTransport,
                MetricsProducerService,
                TracingService,
                LoggerService,
                CorrelationInterceptor,
                {
                    provide: APP_FILTER,
                    useClass: AllExceptionsFilter,
                },
                {
                    provide: APP_INTERCEPTOR,
                    useExisting: CorrelationInterceptor,
                },
            ],
            exports: [
                LoggerService,
                MetricsProducerService,
                TracingService,
                CorrelationIdService,
                WinstonHttpTransport,
                CorrelationInterceptor,
            ],
        };
    }
}
