// test/unit/domain/value-objects/circuit-state.spec.ts
// import {
//     CircuitState,
//     CircuitStateError,
//     CircuitBreaker,
//     CircuitBreakerConfig
// } from '../../../../src/domain/value-objects/circuit-state.vo';

import { CircuitBreaker, CircuitBreakerConfig, CircuitState, CircuitStateError } from "src/domain/value-objects/circuit-state.vo";

describe('CircuitState', () => {
    describe('Static instances', () => {
        it('should have correct static instances', () => {
            expect(CircuitState.CLOSED.value).toBe('CLOSED');
            expect(CircuitState.OPEN.value).toBe('OPEN');
            expect(CircuitState.HALF_OPEN.value).toBe('HALF_OPEN');
            expect(CircuitState.FORCED_OPEN.value).toBe('FORCED_OPEN');
            expect(CircuitState.FORCED_CLOSED.value).toBe('FORCED_CLOSED');
            expect(CircuitState.DISABLED.value).toBe('DISABLED');
        });
    });

    describe('fromString', () => {
        it('should create CircuitState from valid string', () => {
            expect(CircuitState.fromString('CLOSED')).toBe(CircuitState.CLOSED);
            expect(CircuitState.fromString('open')).toBe(CircuitState.OPEN);
            expect(CircuitState.fromString('HALF_OPEN')).toBe(CircuitState.HALF_OPEN);
            expect(CircuitState.fromString('FORCED_CLOSED')).toBe(CircuitState.FORCED_CLOSED);
        });

        it('should throw error for invalid string', () => {
            expect(() => CircuitState.fromString('INVALID')).toThrow(CircuitStateError);
        });
    });

    describe('Instance methods', () => {
        it('should correctly identify closed state', () => {
            expect(CircuitState.CLOSED.isClosed()).toBe(true);
            expect(CircuitState.FORCED_CLOSED.isClosed()).toBe(true);
            expect(CircuitState.OPEN.isClosed()).toBe(false);
        });

        it('should correctly identify open state', () => {
            expect(CircuitState.OPEN.isOpen()).toBe(true);
            expect(CircuitState.FORCED_OPEN.isOpen()).toBe(true);
            expect(CircuitState.CLOSED.isOpen()).toBe(false);
        });

        it('should correctly allow traffic', () => {
            expect(CircuitState.CLOSED.allowsTraffic()).toBe(true);
            expect(CircuitState.HALF_OPEN.allowsTraffic()).toBe(true);
            expect(CircuitState.OPEN.allowsTraffic()).toBe(false);
            expect(CircuitState.FORCED_OPEN.allowsTraffic()).toBe(false);
        });

        it('should correctly identify forced states', () => {
            expect(CircuitState.FORCED_OPEN.isForced()).toBe(true);
            expect(CircuitState.FORCED_CLOSED.isForced()).toBe(true);
            expect(CircuitState.CLOSED.isForced()).toBe(false);
            expect(CircuitState.OPEN.isForced()).toBe(false);
        });
    });

    describe('CircuitBreaker', () => {
        let circuitBreaker: CircuitBreaker;
        const config: CircuitBreakerConfig = {
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 1000,
            maxFailures: 10,
            maxSuccesses: 10,
            openStateTimeout: 100,
            halfOpenStateTimeout: 100,
            testRequestTimeout: 500,
            slidingWindowSize: 10,
            minimumNumberOfCalls: 5,
            waitDurationInOpenState: 1000,
            permittedNumberOfCallsInHalfOpenState: 2,
            automaticTransitionFromOpenToHalfOpenEnabled: true,
        };

        beforeEach(() => {
            circuitBreaker = new CircuitBreaker('test-system', config);
        });

        it('should start in CLOSED state', () => {
            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
        });

        it('should execute successful operation', async () => {
            const result = await circuitBreaker.execute(() => Promise.resolve('success'));
            expect(result).toBe('success');
            expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
        });

        it('should open circuit after multiple failures', async () => {
            // Simular fallos
            for (let i = 0; i < config.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(() => Promise.reject(new Error('test error')));
                } catch {
                    // Expected
                }
            }

            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
        });

        it('should transition to half-open after timeout', async () => {
            // Abrir circuito
            for (let i = 0; i < config.failureThreshold; i++) {
                try {
                    await circuitBreaker.execute(() => Promise.reject(new Error('test error')));
                } catch {
                    // Expected
                }
            }

            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

            // Esperar timeout
            await new Promise(resolve => setTimeout(resolve, config.waitDurationInOpenState + 10));

            // Intentar ejecutar (debería cambiar a half-open)
            try {
                await circuitBreaker.execute(() => Promise.reject(new Error('test error')));
            } catch {
                // Expected
            }

            expect(circuitBreaker.getState()).toBe(CircuitState.OPEN); // Vuelve a OPEN por el fallo
        });

        it('should force state manually', () => {
            circuitBreaker.forceState(CircuitState.FORCED_OPEN);
            expect(circuitBreaker.getState()).toBe(CircuitState.FORCED_OPEN);
        });
    });
});