// Module
export { ObservabilityModule } from './observability.module';
export { OBSERVABILITY_SERVICE_NAME } from './services/metrics-producer.service';

// Services
export { CorrelationIdService } from './services/correlation-id.service';
export { MetricsProducerService } from './services/metrics-producer.service';
export { LoggerService } from './services/logger.service';
export { MonitoringService } from './services/monitoring.service';
export { HealthMetricsService } from './services/health-metrics.service';
export { TracingService } from './services/telemetry/tracing.service';

// Middleware
export { CorrelationMiddleware } from './middleware/correlation.middleware';

// Filters
export { AllExceptionsFilter } from './filters/all-exceptions.filter';

// Interceptors
export { CorrelationInterceptor } from './interceptors/correlation.interceptor';
export { PerformanceInterceptor } from './interceptors/performance.interceptor';

// Decorators
export { TrackPerformance, BusinessMetric, LogExecution } from './decorators/tracking.decorator';

// Interfaces
export { CorrelationContext } from './services/correlation-id.service';
export { EnhancedMetric, MetricType, PublishMetricDto } from './interfaces/metric.interface';
export { ErrorResponse } from './filters/all-exceptions.filter';

// Aliases _v2 para compatibilidad con código interno existente
export { CorrelationIdService as CorrelationIdService_v2 } from './services/correlation-id.service';
export { LoggerService as LoggerService_v2 } from './services/logger.service';
export { MetricsProducerService as MetricsProducerService_v2 } from './services/metrics-producer.service';
export { MonitoringService as MonitoringService_v2 } from './services/monitoring.service';
export { PerformanceInterceptor as PerformanceInterceptor_v2 } from './interceptors/performance.interceptor';
export { AllExceptionsFilter as AllExceptionsFilter_v2 } from './filters/all-exceptions.filter';
export { CorrelationMiddleware as CorrelationMiddleware_v2 } from './middleware/correlation.middleware';
