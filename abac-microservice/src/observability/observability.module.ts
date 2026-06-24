import { Global, Module, DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { CorrelationIdService } from './services/correlation-id.service';
import { MetricsProducerService, OBSERVABILITY_SERVICE_NAME } from './services/metrics-producer.service';
import { LoggerService } from './services/logger.service';
import { MonitoringService } from './services/monitoring.service';
import { HealthMetricsService } from './services/health-metrics.service';
import { TracingService } from './services/telemetry/tracing.service';
import { WinstonRabbitMQTransport } from './transports/winston-rabbitmq.transport';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { CorrelationInterceptor } from './interceptors/correlation.interceptor';
import { PerformanceInterceptor } from './interceptors/performance.interceptor';
import { CorrelationMiddleware } from './middleware/correlation.middleware';

export interface ObservabilityOptions {
    serviceName: string;
    logLevel?: string;
}

const PROVIDERS = [
    CorrelationIdService,
    MetricsProducerService,
    LoggerService,
    MonitoringService,
    HealthMetricsService,
    TracingService,
    WinstonRabbitMQTransport,
    AllExceptionsFilter,
    CorrelationInterceptor,
    PerformanceInterceptor,
    CorrelationMiddleware,
    {
        provide: APP_FILTER,
        useClass: AllExceptionsFilter,
    },
    {
        provide: APP_INTERCEPTOR,
        useClass: CorrelationInterceptor,
    },
];

const EXPORTS = [
    CorrelationIdService,
    MetricsProducerService,
    LoggerService,
    MonitoringService,
    HealthMetricsService,
    TracingService,
    WinstonRabbitMQTransport,
    AllExceptionsFilter,
    CorrelationInterceptor,
    PerformanceInterceptor,
    CorrelationMiddleware,
];

@Global()
@Module({})
export class ObservabilityModule {
    static forRoot(options: ObservabilityOptions): DynamicModule {
        process.env.LOG_LEVEL = options.logLevel ?? 'info';

        return {
            global: true,
            module: ObservabilityModule,
            providers: [
                { provide: OBSERVABILITY_SERVICE_NAME, useValue: options.serviceName },
                ...PROVIDERS,
            ],
            exports: [
                OBSERVABILITY_SERVICE_NAME,
                ...EXPORTS,
            ],
        };
    }
}
