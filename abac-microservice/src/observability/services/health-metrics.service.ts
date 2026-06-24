import { Injectable } from '@nestjs/common';
import { MetricsProducerService } from './metrics-producer.service';

@Injectable()
export class HealthMetricsService {
    constructor(private readonly metrics: MetricsProducerService) { }

    recordDependencyStatus(dependency: string, up: boolean): void {
        this.metrics.observeHistogram('dependency_health_status', up ? 1 : 0, { dependency });

        if (!up) {
            this.metrics.incrementCounter('dependency_down_events_total', 1, { dependency });
        }
    }

    recordDatabaseStatus(up: boolean): void {
        this.recordDependencyStatus('database', up);
    }

    recordBrokerStatus(up: boolean): void {
        this.recordDependencyStatus('rabbitmq', up);
    }
}
