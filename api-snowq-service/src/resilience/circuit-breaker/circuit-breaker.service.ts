import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
    CircuitBreaker,
    CircuitBreakerOpenError,
    CircuitBreakerRegistry,
    type CircuitBreakerMetrics,
} from '@backendkit-labs/circuit-breaker';
import { ServiceNowFatalError, ServiceNowAuthError } from 'src/common';

export { CircuitBreakerOpenError };

// Fatal y auth errors son errores de negocio — no indican que SN esté caído.
// Solo los 5xx y timeouts deben abrir el circuito.
const isSnFailure = (error: unknown): boolean =>
    !(error instanceof ServiceNowFatalError) && !(error instanceof ServiceNowAuthError);

/**
 * Tres circuit breakers independientes por flujo:
 *
 *   sn:monitoring — alertas Nagios/Thruk → SN (threshold más alto: el tráfico es ruidoso)
 *   sn:queue      — cola asíncrona (monolito, integration-service) → SN
 *   sn:immediate  — modo inmediato (llamadas síncronas) → SN
 *
 * Un breaker abierto por tormenta de Nagios no afecta al flujo del monolito.
 */
@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
    private readonly logger = new Logger(CircuitBreakerService.name);
    private readonly registry = new CircuitBreakerRegistry();

    constructor() {
        this.registry.getOrCreate({
            name: 'sn:monitoring',
            failureThreshold: 60,
            minimumCalls: 5,
            slidingWindowSize: 10,
            openTimeoutMs: 30_000,
            isFailure: isSnFailure,
            onStateChange: (from, to) => this.logStateChange('sn:monitoring', from, to),
        });

        this.registry.getOrCreate({
            name: 'sn:queue',
            failureThreshold: 50,
            minimumCalls: 5,
            slidingWindowSize: 10,
            openTimeoutMs: 30_000,
            isFailure: isSnFailure,
            onStateChange: (from, to) => this.logStateChange('sn:queue', from, to),
        });

        this.registry.getOrCreate({
            name: 'sn:immediate',
            failureThreshold: 50,
            minimumCalls: 3,
            slidingWindowSize: 5,
            openTimeoutMs: 15_000,
            isFailure: isSnFailure,
            onStateChange: (from, to) => this.logStateChange('sn:immediate', from, to),
        });
    }

    getBreaker(name: string): CircuitBreaker {
        return this.registry.getOrCreate({ name });
    }

    getAllMetrics(): Record<string, CircuitBreakerMetrics> {
        return this.registry.getAllMetrics();
    }

    getOpenBreakers(): CircuitBreakerMetrics[] {
        return this.registry.getOpenBreakers();
    }

    reset(name: string): void {
        this.registry.reset(name);
    }

    resetAll(): void {
        this.registry.resetAll();
    }

    private logStateChange(name: string, from: string, to: string): void {
        if (to === 'open')      this.logger.warn(`Circuit breaker [${name}] OPEN (from: ${from})`);
        else if (to === 'half_open') this.logger.log(`Circuit breaker [${name}] HALF-OPEN`);
        else if (to === 'closed')    this.logger.log(`Circuit breaker [${name}] CLOSED`);
    }

    onModuleDestroy(): void {}
}
