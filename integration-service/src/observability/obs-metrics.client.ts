import { Logger } from '@nestjs/common';
import { Agent } from 'http';
import axios, { AxiosInstance } from 'axios';

export interface MetricPoint {
    name: string;
    value: number;
    type: 'counter' | 'gauge' | 'histogram';
    labels?: Record<string, string>;
    timestamp?: string;
    service?: string;
    unit?: string;
}

/**
 * Cliente HTTP ligero para enviar métricas al observability-service.
 * Complementa el MetricsService (prom-client) con envío directo a /ingest/metrics.
 *
 * Env vars:
 *   OBS_METRICS_URL — default: http://localhost:3099/ingest/metrics
 *   SERVICE_NAME    — default: integration-service
 */
export class ObsMetricsClient {
    private static readonly logger = new Logger(ObsMetricsClient.name);
    private static instance: ObsMetricsClient;

    private readonly url: string;
    private readonly serviceName: string;
    private readonly agent: Agent;
    private readonly http: AxiosInstance;

    private constructor() {
        this.url = process.env.OBS_METRICS_URL ?? 'http://localhost:3099/ingest/metrics';
        this.serviceName = process.env.SERVICE_NAME ?? 'integration-service';

        this.agent = new Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2 });
        this.http = axios.create({
            httpAgent: this.agent,
            timeout: 1_500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    static getInstance(): ObsMetricsClient {
        if (!ObsMetricsClient.instance) {
            ObsMetricsClient.instance = new ObsMetricsClient();
        }
        return ObsMetricsClient.instance;
    }

    async record(metric: Omit<MetricPoint, 'service' | 'timestamp'>): Promise<void> {
        const point: MetricPoint = {
            ...metric,
            service: this.serviceName,
            timestamp: new Date().toISOString(),
        };
        try {
            await this.http.post(this.url, { metrics: [point] });
        } catch {
            // fire-and-forget
        }
    }

    counter(name: string, labels?: Record<string, string>): Promise<void> {
        return this.record({ name, value: 1, type: 'counter', labels });
    }

    gauge(name: string, value: number, labels?: Record<string, string>): Promise<void> {
        return this.record({ name, value, type: 'gauge', labels });
    }

    histogram(name: string, value: number, unit = 'ms', labels?: Record<string, string>): Promise<void> {
        return this.record({ name, value, type: 'histogram', unit, labels });
    }
}
