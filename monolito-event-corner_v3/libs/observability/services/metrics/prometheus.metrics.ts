import { Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Registry aislado por proceso
 */
export const prometheusRegistry = new Registry();

/**
 * Métricas base del proceso (CPU, memory, GC, event loop)
 */
collectDefaultMetrics({
    register: prometheusRegistry,
});

/**
 * Histogram de latencias por operación
 */
export const operationDurationHistogram = new Histogram({
    name: 'service_operation_duration_ms',
    help: 'Duración de operaciones medidas con perf_hooks',
    labelNames: [
        'service',
        'operation',
        'correlation_id',
    ] as const,
    buckets: [
        5,
        10,
        25,
        50,
        100,
        250,
        500,
        1000,
        2500,
        5000,
    ],
    registers: [prometheusRegistry],
});
