import { Injectable, Logger } from '@nestjs/common';
import CircuitBreaker, { Options, Status } from 'opossum';
import { ServiceNowFatalError, ServiceNowAuthError } from 'src/common';

@Injectable()
export class CircuitBreakerService {
    private readonly logger = new Logger(CircuitBreakerService.name);
    private breakers = new Map<string, CircuitBreaker<any, any>>();

    create<T extends (...args: any[]) => Promise<any>>(
        key: string,
        action: T,
        options?: Options
    ): CircuitBreaker<any> {
        if (this.breakers.has(key)) {
            return this.breakers.get(key) as CircuitBreaker<any>;
        }

        const breaker = new CircuitBreaker<any>(action, {
            timeout: 10000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000,
            // Errores fatales (4xx) y de auth (401/403) no indican que SN esté caído
            // — no deben contar como falla para el circuit breaker.
            // Solo los errores temporales (5xx, timeouts) abren el circuito.
            errorFilter: (error) =>
                error instanceof ServiceNowFatalError ||
                error instanceof ServiceNowAuthError,
            ...options
        });

        breaker.on('open', () => {
            this.logger.warn(`🔴 Circuit breaker [${key}] OPEN`);
        });

        breaker.on('halfOpen', () => {
            this.logger.log(`🟠 Circuit breaker [${key}] HALF-OPEN`);
        });

        breaker.on('close', () => {
            this.logger.log(`🟢 Circuit breaker [${key}] CLOSED`);
        });

        breaker.on('fallback', (result) => {
            this.logger.warn(`⚠️ Circuit breaker [${key}] FALLBACK result: ${result}`);
        });

        this.breakers.set(key, breaker);
        return breaker;
    }

    isOpened(key: string): boolean {
        const breaker = this.breakers.get(key);
        return breaker ? breaker.opened : false;
    }

    isClosed(key: string): boolean {
        const breaker = this.breakers.get(key);
        return breaker ? breaker.closed : false;
    }

    status(key: string): Status | null {
        const breaker = this.breakers.get(key);
        return breaker ? breaker.status : null;
    }

    getBreaker(key: string) {
        return this.breakers.get(key);
    }

    getAllBreakers(): Map<string, CircuitBreaker<any, any>> {
        return this.breakers;
    }
}
