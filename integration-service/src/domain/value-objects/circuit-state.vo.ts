// src/domain/value-objects/circuit-state.vo.ts

/**
 * Value Object que representa el estado de un Circuit Breaker
 * Implementa el patrón de diseño Circuit Breaker para sistemas distribuidos
 */
export class CircuitState {
    // Estados posibles del circuito
    public static readonly CLOSED = new CircuitState('CLOSED', 'circuit_closed');
    public static readonly OPEN = new CircuitState('OPEN', 'circuit_open');
    public static readonly HALF_OPEN = new CircuitState('HALF_OPEN', 'circuit_half_open');

    // Estados transicionales internos
    public static readonly TESTING = new CircuitState('TESTING', 'circuit_testing');
    public static readonly FORCED_OPEN = new CircuitState('FORCED_OPEN', 'circuit_forced_open');
    public static readonly FORCED_CLOSED = new CircuitState('FORCED_CLOSED', 'circuit_forced_closed');
    public static readonly DISABLED = new CircuitState('DISABLED', 'circuit_disabled');

    /**
     * Constructor privado para forzar el uso de las instancias estáticas
     * @param value Valor legible del estado
     * @param code Código interno para métricas y logging
     */
    private constructor(
        public readonly value: string,
        public readonly code: string
    ) { }

    // ========== MÉTODOS DE INSTANCIA ==========

    /**
     * Verifica si el circuito está cerrado (permite tráfico)
     */
    isClosed(): boolean {
        return this === CircuitState.CLOSED || this === CircuitState.FORCED_CLOSED;
    }

    /**
     * Verifica si el circuito está abierto (bloquea tráfico)
     */
    isOpen(): boolean {
        return this === CircuitState.OPEN || this === CircuitState.FORCED_OPEN;
    }

    /**
     * Verifica si el circuito está en estado half-open (permitiendo tráfico limitado)
     */
    isHalfOpen(): boolean {
        return this === CircuitState.HALF_OPEN || this === CircuitState.TESTING;
    }

    /**
     * Verifica si el circuito está deshabilitado
     */
    isDisabled(): boolean {
        return this === CircuitState.DISABLED;
    }

    /**
     * Verifica si el circuito está en un estado forzado (manual override)
     */
    isForced(): boolean {
        return this === CircuitState.FORCED_OPEN || this === CircuitState.FORCED_CLOSED;
    }

    /**
     * Verifica si el circuito permite tráfico
     */
    allowsTraffic(): boolean {
        return this.isClosed() || this.isHalfOpen();
    }

    /**
     * Verifica si el circuito está en un estado de prueba
     */
    isTesting(): boolean {
        return this === CircuitState.TESTING;
    }

    /**
     * Obtiene el siguiente estado natural del circuito
     */
    getNextState(): CircuitState {
        switch (this) {
            case CircuitState.CLOSED:
                return CircuitState.OPEN; // Cuando se excede el threshold de fallos
            case CircuitState.OPEN:
                return CircuitState.HALF_OPEN; // Después del timeout
            case CircuitState.HALF_OPEN:
                return CircuitState.CLOSED; // Si las pruebas tienen éxito
            case CircuitState.TESTING:
                return CircuitState.HALF_OPEN; // Después de la prueba
            default:
                return this; // Estados forzados no cambian automáticamente
        }
    }

    /**
     * Obtiene el estado de emergencia (fallback)
     */
    getEmergencyState(): CircuitState {
        // Cuando no podemos determinar el estado, asumimos OPEN por seguridad
        return CircuitState.OPEN;
    }

    /**
     * Obtiene el tiempo de timeout recomendado para este estado
     */
    getRecommendedTimeout(): number {
        switch (this) {
            case CircuitState.OPEN:
                return 30000; // 30 segundos
            case CircuitState.HALF_OPEN:
                return 5000; // 5 segundos para pruebas
            case CircuitState.TESTING:
                return 10000; // 10 segundos máximo para testing
            default:
                return 0; // No timeout para otros estados
        }
    }

    /**
     * Obtiene el mensaje descriptivo del estado
     */
    getDescription(): string {
        const descriptions: Record<string, string> = {
            'CLOSED': 'Circuit is closed, allowing all traffic',
            'OPEN': 'Circuit is open, blocking all traffic',
            'HALF_OPEN': 'Circuit is half-open, allowing limited traffic for testing',
            'TESTING': 'Circuit is in testing mode, evaluating system health',
            'FORCED_OPEN': 'Circuit is forced open (manual override), blocking all traffic',
            'FORCED_CLOSED': 'Circuit is forced closed (manual override), allowing all traffic',
            'DISABLED': 'Circuit breaker is disabled, allowing all traffic without protection',
        };
        return descriptions[this.value] || 'Unknown circuit state';
    }

    /**
     * Obtiene el nivel de severidad para logging
     */
    getSeverityLevel(): 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' {
        switch (this) {
            case CircuitState.OPEN:
            case CircuitState.FORCED_OPEN:
                return 'ERROR';
            case CircuitState.HALF_OPEN:
            case CircuitState.TESTING:
                return 'WARN';
            case CircuitState.CLOSED:
            case CircuitState.FORCED_CLOSED:
                return 'INFO';
            case CircuitState.DISABLED:
                return 'DEBUG';
            default:
                return 'INFO';
        }
    }

    /**
     * Verifica igualdad con otro CircuitState
     */
    equals(other: CircuitState): boolean {
        return this.value === other.value;
    }

    /**
     * Convierte el estado a string (para logging, serialización)
     */
    toString(): string {
        return this.value;
    }

    /**
     * Convierte el estado a JSON
     */
    toJSON(): object {
        return {
            value: this.value,
            code: this.code,
            description: this.getDescription(),
            allowsTraffic: this.allowsTraffic(),
            isForced: this.isForced(),
        };
    }

    // ========== MÉTODOS ESTÁTICOS ==========

    /**
     * Crea un CircuitState a partir de un string
     */
    static fromString(value: string): CircuitState {
        const upperValue = value.toUpperCase();

        const stateMap: Record<string, CircuitState> = {
            'CLOSED': CircuitState.CLOSED,
            'OPEN': CircuitState.OPEN,
            'HALF_OPEN': CircuitState.HALF_OPEN,
            'HALF_OPENED': CircuitState.HALF_OPEN,
            'TESTING': CircuitState.TESTING,
            'FORCED_OPEN': CircuitState.FORCED_OPEN,
            'FORCED_CLOSED': CircuitState.FORCED_CLOSED,
            'DISABLED': CircuitState.DISABLED,
        };

        const state = stateMap[upperValue];

        if (!state) {
            throw new CircuitStateError(`Invalid circuit state: ${value}`, {
                receivedValue: value,
                validValues: Object.keys(stateMap),
            });
        }

        return state;
    }

    /**
     * Crea un CircuitState a partir de un código
     */
    static fromCode(code: string): CircuitState {
        const codeMap: Record<string, CircuitState> = {
            'circuit_closed': CircuitState.CLOSED,
            'circuit_open': CircuitState.OPEN,
            'circuit_half_open': CircuitState.HALF_OPEN,
            'circuit_testing': CircuitState.TESTING,
            'circuit_forced_open': CircuitState.FORCED_OPEN,
            'circuit_forced_closed': CircuitState.FORCED_CLOSED,
            'circuit_disabled': CircuitState.DISABLED,
        };

        const state = codeMap[code];

        if (!state) {
            throw new CircuitStateError(`Invalid circuit state code: ${code}`, {
                receivedCode: code,
                validCodes: Object.keys(codeMap),
            });
        }

        return state;
    }

    /**
     * Obtiene todos los estados disponibles
     */
    static getAllStates(): CircuitState[] {
        return [
            CircuitState.CLOSED,
            CircuitState.OPEN,
            CircuitState.HALF_OPEN,
            CircuitState.TESTING,
            CircuitState.FORCED_OPEN,
            CircuitState.FORCED_CLOSED,
            CircuitState.DISABLED,
        ];
    }

    /**
     * Obtiene estados que permiten tráfico
     */
    static getTrafficAllowedStates(): CircuitState[] {
        return this.getAllStates().filter(state => state.allowsTraffic());
    }

    /**
     * Obtiene estados que bloquean tráfico
     */
    static getTrafficBlockedStates(): CircuitState[] {
        return this.getAllStates().filter(state => !state.allowsTraffic());
    }

    /**
     * Obtiene estados naturales (no forzados)
     */
    static getNaturalStates(): CircuitState[] {
        return [
            CircuitState.CLOSED,
            CircuitState.OPEN,
            CircuitState.HALF_OPEN,
            CircuitState.TESTING,
        ];
    }

    /**
     * Obtiene estados forzados
     */
    static getForcedStates(): CircuitState[] {
        return [
            CircuitState.FORCED_OPEN,
            CircuitState.FORCED_CLOSED,
        ];
    }

    /**
     * Determina el estado inicial basado en la configuración del sistema
     */
    static getInitialState(systemConfig: {
        enabled: boolean;
        initiallyClosed?: boolean;
    }): CircuitState {
        if (!systemConfig.enabled) {
            return CircuitState.DISABLED;
        }

        return systemConfig.initiallyClosed === false
            ? CircuitState.OPEN
            : CircuitState.CLOSED;
    }

    /**
     * Calcula el próximo estado basado en el estado actual y las condiciones
     */
    static calculateNextState(
        currentState: CircuitState,
        conditions: {
            failureCount: number;
            failureThreshold: number;
            successCount: number;
            successThreshold: number;
            isTimeoutElapsed: boolean;
            isForced?: boolean;
            forceState?: CircuitState;
        }
    ): CircuitState {
        // Si hay un estado forzado, usarlo
        if (conditions.isForced && conditions.forceState) {
            return conditions.forceState;
        }

        // Lógica de transición de estado
        switch (currentState) {
            case CircuitState.CLOSED:
                // Si excedemos el threshold de fallos, abrir el circuito
                if (conditions.failureCount >= conditions.failureThreshold) {
                    return CircuitState.OPEN;
                }
                return CircuitState.CLOSED;

            case CircuitState.OPEN:
                // Si ha pasado el timeout, cambiar a half-open
                if (conditions.isTimeoutElapsed) {
                    return CircuitState.HALF_OPEN;
                }
                return CircuitState.OPEN;

            case CircuitState.HALF_OPEN:
                // Si tenemos suficientes éxitos, cerrar el circuito
                if (conditions.successCount >= conditions.successThreshold) {
                    return CircuitState.CLOSED;
                }
                // Si tenemos más fallos, volver a abrir
                if (conditions.failureCount > 0) {
                    return CircuitState.OPEN;
                }
                return CircuitState.HALF_OPEN;

            case CircuitState.TESTING:
                // Después de testing, volver a half-open
                return CircuitState.HALF_OPEN;

            default:
                // Estados forzados y disabled no cambian automáticamente
                return currentState;
        }
    }

    /**
     * Valida si una transición de estado es válida
     */
    static isValidTransition(from: CircuitState, to: CircuitState): boolean {
        // Definir transiciones válidas
        const validTransitions: Map<CircuitState, CircuitState[]> = new Map([
            [CircuitState.CLOSED, [CircuitState.OPEN, CircuitState.FORCED_OPEN, CircuitState.FORCED_CLOSED, CircuitState.DISABLED]],
            [CircuitState.OPEN, [CircuitState.HALF_OPEN, CircuitState.FORCED_OPEN, CircuitState.FORCED_CLOSED, CircuitState.DISABLED]],
            [CircuitState.HALF_OPEN, [CircuitState.CLOSED, CircuitState.OPEN, CircuitState.TESTING, CircuitState.FORCED_OPEN, CircuitState.FORCED_CLOSED, CircuitState.DISABLED]],
            [CircuitState.TESTING, [CircuitState.HALF_OPEN, CircuitState.FORCED_OPEN, CircuitState.FORCED_CLOSED, CircuitState.DISABLED]],
            [CircuitState.FORCED_OPEN, [CircuitState.CLOSED, CircuitState.OPEN, CircuitState.HALF_OPEN, CircuitState.DISABLED]],
            [CircuitState.FORCED_CLOSED, [CircuitState.CLOSED, CircuitState.OPEN, CircuitState.HALF_OPEN, CircuitState.DISABLED]],
            [CircuitState.DISABLED, [CircuitState.CLOSED, CircuitState.FORCED_OPEN, CircuitState.FORCED_CLOSED]],
        ]);

        const allowedTransitions = validTransitions.get(from) || [];
        return allowedTransitions.some(state => state.equals(to));
    }
}

// ========== ERRORES ESPECÍFICOS ==========

/**
 * Error específico para estados de circuito inválidos
 */
export class CircuitStateError extends Error {
    constructor(
        message: string,
        public readonly context?: Record<string, any>
    ) {
        super(message);
        this.name = 'CircuitStateError';
    }
}

// ========== INTERFACES RELACIONADAS ==========

/**
 * Configuración del Circuit Breaker
 */
export interface CircuitBreakerConfig {
    // Thresholds
    failureThreshold: number; // Número de fallos para abrir el circuito
    successThreshold: number; // Número de éxitos para cerrar el circuito
    timeout: number; // Tiempo en ms antes de intentar half-open

    // Límites
    maxFailures: number; // Máximo número de fallos registrados
    maxSuccesses: number; // Máximo número de éxitos registrados

    // Timeouts específicos
    openStateTimeout: number; // Tiempo que permanece OPEN
    halfOpenStateTimeout: number; // Tiempo que permanece HALF_OPEN
    testRequestTimeout: number; // Timeout para requests de prueba

    // Configuración avanzada
    slidingWindowSize: number; // Tamaño de la ventana deslizante para métricas
    minimumNumberOfCalls: number; // Mínimo número de llamadas antes de calcular estadísticas
    waitDurationInOpenState: number; // Tiempo de espera en estado OPEN
    permittedNumberOfCallsInHalfOpenState: number; // Número de llamadas permitidas en HALF_OPEN
    automaticTransitionFromOpenToHalfOpenEnabled: boolean; // Transición automática
}

/**
 * Estadísticas del Circuit Breaker
 */
export interface CircuitBreakerStats {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    notPermittedCalls: number; // Llamadas rechazadas cuando el circuito está OPEN
    failureRate: number; // Porcentaje de fallos
    slowCalls: number; // Llamadas que excedieron el timeout
    slowCallRate: number; // Porcentaje de llamadas lentas
    currentState: CircuitState;
    lastStateChange: Date;
    lastFailure?: Date;
    lastSuccess?: Date;
    metrics: {
        latency: {
            p50: number;
            p90: number;
            p95: number;
            p99: number;
        };
        throughput: number; // Llamadas por segundo
    };
}

/**
 * Evento del Circuit Breaker
 */
export interface CircuitBreakerEvent {
    type: 'STATE_CHANGED' | 'CALL_SUCCESS' | 'CALL_FAILURE' | 'CALL_NOT_PERMITTED' | 'CALL_SLOW';
    fromState?: CircuitState;
    toState?: CircuitState;
    systemId: string;
    timestamp: Date;
    duration?: number;
    error?: any;
    metadata?: Record<string, any>;
}

/**
 * Listener para eventos del Circuit Breaker
 */
export interface CircuitBreakerListener {
    onStateChanged(event: CircuitBreakerEvent): void;
    onCallSuccess(event: CircuitBreakerEvent): void;
    onCallFailure(event: CircuitBreakerEvent): void;
    onCallNotPermitted(event: CircuitBreakerEvent): void;
    onCallSlow(event: CircuitBreakerEvent): void;
}

// ========== IMPLEMENTACIÓN DEL CIRCUIT BREAKER ==========

/**
 * Implementación completa del Circuit Breaker
 */
export class CircuitBreaker {
    private currentState: CircuitState;
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime?: Date;
    private lastSuccessTime?: Date;
    private stateChangeTime: Date;
    private listeners: CircuitBreakerListener[] = [];
    private stats: CircuitBreakerStats;
    private forcedState?: CircuitState;
    private isForced: boolean = false;

    constructor(
        private readonly systemId: string,
        private readonly config: CircuitBreakerConfig,
        initialState: CircuitState = CircuitState.CLOSED
    ) {
        this.currentState = initialState;
        this.stateChangeTime = new Date();
        this.stats = this.initializeStats();
    }

    /**
     * Ejecuta una operación protegida por el circuit breaker
     */
    async execute<T>(
        operation: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        const startTime = Date.now();

        // Verificar si la llamada está permitida
        if (!this.isCallPermitted()) {
            this.recordNotPermittedCall();
            this.emitEvent({
                type: 'CALL_NOT_PERMITTED',
                systemId: this.systemId,
                timestamp: new Date(),
                metadata,
            });

            throw new CircuitBreakerBlockedError(
                `Call not permitted, circuit is ${this.currentState.value}`,
                this.currentState,
                this.systemId
            );
        }

        try {
            // Ejecutar la operación con timeout
            const result = await this.executeWithTimeout(operation);
            const duration = Date.now() - startTime;

            // Registrar éxito
            this.recordSuccess();

            // Verificar si es una llamada lenta
            if (duration > this.config.testRequestTimeout) {
                this.recordSlowCall(duration);
                this.emitEvent({
                    type: 'CALL_SLOW',
                    systemId: this.systemId,
                    timestamp: new Date(),
                    duration,
                    metadata,
                });
            } else {
                this.emitEvent({
                    type: 'CALL_SUCCESS',
                    systemId: this.systemId,
                    timestamp: new Date(),
                    duration,
                    metadata,
                });
            }

            // Actualizar estado si es necesario
            this.updateStateBasedOnConditions();

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            // Registrar fallo
            this.recordFailure();

            this.emitEvent({
                type: 'CALL_FAILURE',
                systemId: this.systemId,
                timestamp: new Date(),
                duration,
                error,
                metadata,
            });

            // Actualizar estado si es necesario
            this.updateStateBasedOnConditions();

            throw error;
        }
    }

    /**
     * Fuerza un estado específico (override manual)
     */
    forceState(state: CircuitState): void {
        if (!state.isForced() && state !== CircuitState.DISABLED) {
            throw new CircuitStateError(`Cannot force non-forced state: ${state.value}`);
        }

        const previousState = this.currentState;
        this.currentState = state;
        this.isForced = true;
        this.forcedState = state;
        this.stateChangeTime = new Date();

        this.emitEvent({
            type: 'STATE_CHANGED',
            fromState: previousState,
            toState: state,
            systemId: this.systemId,
            timestamp: new Date(),
            metadata: { forced: true },
        });
    }

    /**
     * Restaura el estado automático
     */
    resetToAutomatic(): void {
        if (!this.isForced) {
            return;
        }

        const previousState = this.currentState;
        this.isForced = false;
        this.forcedState = undefined;

        // Volver al estado natural basado en las condiciones actuales
        this.updateStateBasedOnConditions();

        this.emitEvent({
            type: 'STATE_CHANGED',
            fromState: previousState,
            toState: this.currentState,
            systemId: this.systemId,
            timestamp: new Date(),
            metadata: { forced: false },
        });
    }

    /**
     * Resetea el circuit breaker a su estado inicial
     */
    reset(): void {
        const previousState = this.currentState;

        this.currentState = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = undefined;
        this.lastSuccessTime = undefined;
        this.stateChangeTime = new Date();
        this.isForced = false;
        this.forcedState = undefined;
        this.stats = this.initializeStats();

        this.emitEvent({
            type: 'STATE_CHANGED',
            fromState: previousState,
            toState: this.currentState,
            systemId: this.systemId,
            timestamp: new Date(),
            metadata: { reset: true },
        });
    }

    /**
     * Obtiene el estado actual
     */
    getState(): CircuitState {
        return this.currentState;
    }

    /**
     * Obtiene estadísticas
     */
    getStats(): CircuitBreakerStats {
        return { ...this.stats };
    }

    /**
     * Agrega un listener
     */
    addListener(listener: CircuitBreakerListener): void {
        this.listeners.push(listener);
    }

    /**
     * Remueve un listener
     */
    removeListener(listener: CircuitBreakerListener): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    // ========== MÉTODOS PRIVADOS ==========

    private initializeStats(): CircuitBreakerStats {
        return {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            notPermittedCalls: 0,
            failureRate: 0,
            slowCalls: 0,
            slowCallRate: 0,
            currentState: this.currentState,
            lastStateChange: this.stateChangeTime,
            metrics: {
                latency: {
                    p50: 0,
                    p90: 0,
                    p95: 0,
                    p99: 0,
                },
                throughput: 0,
            },
        };
    }

    private isCallPermitted(): boolean {
        if (this.currentState.isDisabled()) {
            return true;
        }

        if (this.currentState.isOpen() && !this.currentState.isForced()) {
            return false;
        }

        if (this.currentState.isHalfOpen() && !this.currentState.isForced()) {
            // En half-open, limitar el número de llamadas
            const callsInHalfOpen = this.stats.totalCalls -
                (this.stats.successfulCalls + this.stats.failedCalls + this.stats.notPermittedCalls);

            return callsInHalfOpen < this.config.permittedNumberOfCallsInHalfOpenState;
        }

        return true;
    }

    private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
        const timeout = this.getCurrentTimeout();

        return Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new CircuitBreakerTimeoutError(
                    `Operation timed out after ${timeout}ms`,
                    this.systemId
                )), timeout);
            }),
        ]);
    }

    private getCurrentTimeout(): number {
        if (this.currentState.isHalfOpen() || this.currentState.isTesting()) {
            return this.config.testRequestTimeout;
        }

        return this.config.timeout;
    }

    private recordSuccess(): void {
        this.successCount = Math.min(this.successCount + 1, this.config.maxSuccesses);
        this.lastSuccessTime = new Date();

        this.stats.totalCalls++;
        this.stats.successfulCalls++;
        this.updateFailureRate();
    }

    private recordFailure(): void {
        this.failureCount = Math.min(this.failureCount + 1, this.config.maxFailures);
        this.lastFailureTime = new Date();

        this.stats.totalCalls++;
        this.stats.failedCalls++;
        this.updateFailureRate();
    }

    private recordNotPermittedCall(): void {
        this.stats.notPermittedCalls++;
    }

    private recordSlowCall(duration: number): void {
        this.stats.slowCalls++;
        this.stats.slowCallRate = (this.stats.slowCalls / this.stats.totalCalls) * 100;

        // Actualizar percentiles de latencia (simplificado)
        // En una implementación real, usarías un histograma
    }

    private updateFailureRate(): void {
        const totalCompletedCalls = this.stats.successfulCalls + this.stats.failedCalls;
        this.stats.failureRate = totalCompletedCalls > 0
            ? (this.stats.failedCalls / totalCompletedCalls) * 100
            : 0;
    }

    private updateStateBasedOnConditions(): void {
        if (this.isForced) {
            return; // No cambiar estados forzados automáticamente
        }

        const isTimeoutElapsed = this.isTimeoutElapsed();
        const newState = CircuitState.calculateNextState(this.currentState, {
            failureCount: this.failureCount,
            failureThreshold: this.config.failureThreshold,
            successCount: this.successCount,
            successThreshold: this.config.successThreshold,
            isTimeoutElapsed,
            isForced: this.isForced,
            forceState: this.forcedState,
        });

        if (!newState.equals(this.currentState)) {
            this.transitionTo(newState);
        }
    }

    private isTimeoutElapsed(): boolean {
        if (!this.lastFailureTime) {
            return false;
        }

        const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();

        switch (this.currentState) {
            case CircuitState.OPEN:
                return timeSinceLastFailure >= this.config.waitDurationInOpenState;
            case CircuitState.HALF_OPEN:
                return timeSinceLastFailure >= this.config.halfOpenStateTimeout;
            default:
                return false;
        }
    }

    private transitionTo(newState: CircuitState): void {
        if (!CircuitState.isValidTransition(this.currentState, newState)) {
            throw new CircuitStateError(
                `Invalid circuit state transition: ${this.currentState.value} -> ${newState.value}`,
                {
                    fromState: this.currentState.value,
                    toState: newState.value,
                    systemId: this.systemId,
                }
            );
        }

        const previousState = this.currentState;
        this.currentState = newState;
        this.stateChangeTime = new Date();

        // Reset counters para ciertas transiciones
        if (newState === CircuitState.CLOSED) {
            this.failureCount = 0;
            this.successCount = 0;
        } else if (newState === CircuitState.HALF_OPEN) {
            this.successCount = 0;
        }

        // Actualizar estadísticas
        this.stats.currentState = newState;
        this.stats.lastStateChange = this.stateChangeTime;

        this.emitEvent({
            type: 'STATE_CHANGED',
            fromState: previousState,
            toState: newState,
            systemId: this.systemId,
            timestamp: new Date(),
        });
    }

    private emitEvent(event: CircuitBreakerEvent): void {
        this.listeners.forEach(listener => {
            try {
                switch (event.type) {
                    case 'STATE_CHANGED':
                        listener.onStateChanged(event);
                        break;
                    case 'CALL_SUCCESS':
                        listener.onCallSuccess(event);
                        break;
                    case 'CALL_FAILURE':
                        listener.onCallFailure(event);
                        break;
                    case 'CALL_NOT_PERMITTED':
                        listener.onCallNotPermitted(event);
                        break;
                    case 'CALL_SLOW':
                        listener.onCallSlow(event);
                        break;
                }
            } catch (error) {
                // No dejar que errores en listeners rompan el circuit breaker
                console.error('Error in circuit breaker listener:', error);
            }
        });
    }
}

// ========== ERRORES ESPECÍFICOS DEL CIRCUIT BREAKER ==========

export class CircuitBreakerBlockedError extends Error {
    constructor(
        message: string,
        public readonly circuitState: CircuitState,
        public readonly systemId: string
    ) {
        super(message);
        this.name = 'CircuitBreakerBlockedError';
    }
}

export class CircuitBreakerTimeoutError extends Error {
    constructor(
        message: string,
        public readonly systemId: string
    ) {
        super(message);
        this.name = 'CircuitBreakerTimeoutError';
    }
}

// ========== DECORATOR PARA CIRCUIT BREAKER ==========

/**
 * Decorator para aplicar circuit breaker automáticamente a métodos
 */
export function withCircuitBreaker(
    systemId: string,
    config: Partial<CircuitBreakerConfig> = {}
) {
    return function (
        target: any,
        propertyName: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        const circuitBreaker = new CircuitBreaker(
            systemId,
            {
                failureThreshold: 5,
                successThreshold: 3,
                timeout: 10000,
                maxFailures: 100,
                maxSuccesses: 100,
                openStateTimeout: 30000,
                halfOpenStateTimeout: 10000,
                testRequestTimeout: 5000,
                slidingWindowSize: 100,
                minimumNumberOfCalls: 10,
                waitDurationInOpenState: 60000,
                permittedNumberOfCallsInHalfOpenState: 5,
                automaticTransitionFromOpenToHalfOpenEnabled: true,
                ...config,
            }
        );

        descriptor.value = async function (...args: any[]) {
            return circuitBreaker.execute(
                () => originalMethod.apply(this, args),
                {
                    method: propertyName,
                    className: target.constructor.name,
                    args: args.length > 0 ? 'present' : 'empty',
                }
            );
        };

        // Exponer el circuit breaker para monitoreo
        if (!target.__circuitBreakers) {
            target.__circuitBreakers = new Map();
        }
        target.__circuitBreakers.set(propertyName, circuitBreaker);

        return descriptor;
    };
}