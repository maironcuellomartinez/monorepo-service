import { Injectable } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { MetricsProducerService } from './metrics-producer.service';
import { CorrelationIdService } from './correlation-id.service';

@Injectable()
export class MonitoringService {
    constructor(
        private readonly logger: LoggerService,
        private readonly metrics: MetricsProducerService,
        private readonly correlation: CorrelationIdService,
    ) { }

    async trackOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
        const start = Date.now();

        this.logger.log(`Starting operation: ${name}`, 'Monitoring');

        try {
            const result = await operation();
            const elapsed = Date.now() - start;

            this.metrics.observeHistogram('operation_duration_ms', elapsed, {
                operation: name,
                status: 'success',
            });

            this.logger.log(`Operation completed: ${name}`, 'Monitoring');
            return result;
        } catch (error) {
            const elapsed = Date.now() - start;

            this.metrics.incrementCounter('operation_errors_total', 1, { operation: name });

            this.logger.error(
                `Operation failed: ${name} after ${elapsed}ms`,
                (error as Error)?.stack,
                'Monitoring',
            );

            throw error;
        }
    }

    recordCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
        this.metrics.incrementCounter(name, value, labels);
    }

    recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
        this.metrics.observeHistogram(name, value, labels);
    }
}
