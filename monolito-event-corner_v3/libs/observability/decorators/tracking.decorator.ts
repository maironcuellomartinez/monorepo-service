import { SetMetadata, applyDecorators, UseInterceptors } from '@nestjs/common';
import { PerformanceInterceptor } from '../interceptors/performance-metrics.interceptor';

/**
 * Decorador para registrar la ejecución de una operación.
 * @returns {Function} Decorador.
 * @description This decorator is used to log the execution of a method.
 */
export const TrackPerformance = () => applyDecorators(
    UseInterceptors(PerformanceInterceptor),
);

/**
 * Decorador para registrar una métrica de negocio.
 * @param metricName Nombre de la métrica.
 * @param labels Etiquetas de la métrica.
 * @returns {Function} Decorador.
 * @description This decorator is used to log the execution of a method.
 */
export const BusinessMetric = (metricName: string, labels: Record<string, string> = {}) =>
    SetMetadata('business_metric', { name: metricName, labels });

/**
 * Decorador para registrar la ejecución de una operación.
 * @returns {Function} Decorador.
 * @description This decorator is used to log the execution of a method.
 */
export const LogExecution = () => SetMetadata('log_execution', true);