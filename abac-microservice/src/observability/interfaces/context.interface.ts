import { MetricType } from './metric.interface';
import { trace, context, Span } from '@opentelemetry/api';


export const tracer = trace.getTracer(
    'correlation-tracer',
);

/**
 * Resultado histórico de un timer
 */
export interface TimerResult {
    /** Nombre lógico del timer */
    name: string;

    /** Duración en milisegundos (high resolution) */
    duration: number;

    /** Momento en que se registró el resultado */
    timestamp: Date;
}

export interface Context {
    correlationId: string;
    timers: Map<string, number>;
    cumulativeTimers: Map<string, number>;
    timerResults: TimerResult[];
    labels: Record<string, string>;
}

/**
 * Contexto aislado por AsyncLocalStorage
 */
export interface Context_v2 {
    /** CorrelationId único por request / flujo */
    correlationId: string;

    /** Etiquetas dinámicas (service, route, user, etc.) */
    labels: Record<string, string>;

    /**
     * Timers activos:
     * timerName -> performance.mark name
     */
    activeMarks: Map<string, string>;

    /**
     * Spans activos:
     * spanName -> span
     */
    activeSpans: Map<string, Span>;

    /**
     * Tiempo acumulado por timer
     */
    cumulativeTimers: Map<string, number>;

    /**
     * Historial de ejecuciones
     */
    timerResults: TimerResult[];
}

/**
 * Payload emitido hacia el sistema de métricas
 */
export interface PerformanceData {
    /** Nombre lógico del timer */
    timerName: string;
    /** Tiempo transcurrido en ms */
    elapsed: number;
    /** CorrelationId único por request / flujo */
    correlationId: string;
    /** Timestamp de la medición */
    timestamp: Date;
    /** Nombre del servicio */
    service: string;
    /** Etiquetas dinámicas (service, route, user, etc.) */
    labels: Record<string, string>;
}

export interface PushMetricDto {
    name: string;
    type: MetricType;
    value: number;
    labels: Record<string, string>;
    service?: string;
    timestamp?: Date;
}