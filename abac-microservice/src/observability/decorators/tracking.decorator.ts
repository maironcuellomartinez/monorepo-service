import { SetMetadata, applyDecorators, UseInterceptors } from '@nestjs/common';
import { PerformanceInterceptor } from '../interceptors/performance.interceptor';

export const TrackPerformance = () => applyDecorators(
    UseInterceptors(PerformanceInterceptor),
);

export const BusinessMetric = (metricName: string, labels: Record<string, string> = {}) =>
    SetMetadata('business_metric', { name: metricName, labels });

export const LogExecution = () => SetMetadata('log_execution', true);
