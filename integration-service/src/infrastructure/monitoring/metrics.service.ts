// src/infrastructure/monitoring/metrics.service.ts
import client from 'prom-client';

export class MetricsService {
    private readonly register: client.Registry;

    // Contadores
    private readonly integrationRequestsCounter: client.Counter;
    private readonly integrationErrorsCounter: client.Counter;
    private readonly circuitBreakerStateChangesCounter: client.Counter;

    // Histogramas
    private readonly integrationDurationHistogram: client.Histogram;
    private readonly externalCallDurationHistogram: client.Histogram;

    constructor() {
        this.register = new client.Registry();
        client.collectDefaultMetrics({ register: this.register });

        // Inicializar métricas
        this.integrationRequestsCounter = new client.Counter({
            name: 'integration_requests_total',
            help: 'Total number of integration requests',
            labelNames: ['event_type', 'status', 'system']
        });

        this.integrationErrorsCounter = new client.Counter({
            name: 'integration_errors_total',
            help: 'Total number of integration errors',
            labelNames: ['event_type', 'system', 'error_type']
        });

        this.integrationDurationHistogram = new client.Histogram({
            name: 'integration_duration_seconds',
            help: 'Duration of integration processing in seconds',
            labelNames: ['event_type'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
        });

        this.circuitBreakerStateChangesCounter = new client.Counter({
            name: 'circuit_breaker_state_changes_total',
            help: 'Total number of circuit breaker state changes',
            labelNames: ['system', 'from_state', 'to_state']
        });

        // Registrar métricas
        this.register.registerMetric(this.integrationRequestsCounter);
        this.register.registerMetric(this.integrationErrorsCounter);
        this.register.registerMetric(this.integrationDurationHistogram);
        this.register.registerMetric(this.circuitBreakerStateChangesCounter);
    }

    recordIntegrationRequest(eventType: string, system: string): void {
        this.integrationRequestsCounter.inc({ event_type: eventType, system });
    }

    recordIntegrationSuccess(eventType: string, system: string): void {
        this.integrationRequestsCounter.inc({
            event_type: eventType,
            system,
            status: 'success'
        });
    }

    recordIntegrationError(eventType: string, system: string, errorType: string): void {
        this.integrationErrorsCounter.inc({
            event_type: eventType,
            system,
            error_type: errorType
        });
    }

    startIntegrationTimer(eventType: string): () => void {
        const end = this.integrationDurationHistogram.startTimer({ event_type: eventType });
        return end;
    }

    recordCircuitBreakerChange(system: string, fromState: string, toState: string): void {
        this.circuitBreakerStateChangesCounter.inc({
            system,
            from_state: fromState,
            to_state: toState
        });
    }

    async getMetrics(): Promise<string> {
        return await this.register.metrics();
    }
}