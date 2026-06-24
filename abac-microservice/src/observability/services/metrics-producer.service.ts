import { Inject, Injectable, Logger } from '@nestjs/common';
import { metrics, Meter } from '@opentelemetry/api';
import { CorrelationIdService } from './correlation-id.service';

export const OBSERVABILITY_SERVICE_NAME = 'OBSERVABILITY_SERVICE_NAME';

@Injectable()
export class MetricsProducerService {
    private readonly meter: Meter;
    private readonly logger = new Logger(MetricsProducerService.name);

    constructor(
        private readonly correlation: CorrelationIdService,
        @Inject(OBSERVABILITY_SERVICE_NAME) private readonly serviceName: string,
    ) {
        this.meter = metrics.getMeter(this.serviceName);
    }

    observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
        const histogram = this.meter.createHistogram(name, { unit: 'ms' });
        histogram.record(value, {
            ...this.correlation.getLabels(),
            ...labels,
        });
    }

    incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
        const counter = this.meter.createCounter(name);
        counter.add(value, {
            ...this.correlation.getLabels(),
            ...labels,
        });
    }

    async publishLog(_logData: any, _level?: 'info' | 'warn' | 'error' | 'debug'): Promise<void> {
        // Broker client not configured — log forwarding disabled.
    }
}
