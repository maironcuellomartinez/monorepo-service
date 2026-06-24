import { RetryPolicy } from "../interfaces/external-connector.interface";
import { CircuitState } from "../value-objects/circuit-state.vo";

export interface ExternalSystemConfig {
    baseUrl: string;
    timeout: number;
    headers?: Record<string, string>;
    retryPolicy: RetryPolicy;
}

export class ExternalSystem {
    public readonly id: string;
    public readonly name: string;
    public readonly type: string;
    public readonly config: ExternalSystemConfig;
    public circuitState: CircuitState;
    public isActive: boolean;
    public failureCount: number;
    public lastFailureAt?: Date;
    public lastSuccessAt?: Date;

    constructor(
        id: string,
        name: string,
        type: string,
        config: ExternalSystemConfig
    ) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.config = config;
        this.circuitState = CircuitState.CLOSED;
        this.isActive = true;
        this.failureCount = 0;
    }

    recordSuccess(): void {
        this.failureCount = 0;
        this.lastSuccessAt = new Date();

        if (this.circuitState.value === CircuitState.HALF_OPEN.value) {
            this.circuitState = CircuitState.CLOSED;
        }
    }

    recordFailure(): void {
        this.failureCount++;
        this.lastFailureAt = new Date();
    }

    canExecute(): boolean {
        return this.isActive &&
            this.circuitState.value !== CircuitState.OPEN.value;
    }

    getRetryDelay(attempt: number): number {
        const { initialDelay, maxDelay, multiplier } = this.config.retryPolicy;
        const delay = initialDelay * Math.pow(multiplier, attempt - 1);
        return Math.min(delay, maxDelay);
    }
}