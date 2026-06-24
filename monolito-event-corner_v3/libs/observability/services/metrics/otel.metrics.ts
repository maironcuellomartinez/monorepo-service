import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('performance-meter');

/**
 * Histogram de duración de operaciones
 */
export const otelOperationHistogram =
    meter.createHistogram(
        'service.operation.duration',
        {
            description:
                'Duración de operaciones medidas con perf_hooks',
            unit: 'ms',
        },
    );
