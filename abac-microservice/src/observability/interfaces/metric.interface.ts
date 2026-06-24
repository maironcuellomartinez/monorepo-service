export enum MetricType {
    COUNTER = 'counter',
    GAUGE = 'gauge',
    HISTOGRAM = 'histogram',
    SUMMARY = 'summary',
}

export interface EnhancedMetric {
    name: string;
    type: MetricType;
    value: number;
    labels: Record<string, string>;
    service: string;
    timestamp: Date;
    correlationId: string;
}

export class PublishMetricDto {
    name!: string;
    type!: MetricType;
    value!: number;
    labels!: Record<string, string>;
    service!: string;
    timestamp!: Date;
    correlationId!: string;
}