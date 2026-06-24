/**
 * Bulkhead Pattern Implementation
 * Limita el número de ejecuciones concurrentes para un recurso
 * Inspirado en Resilience4j Bulkhead
 */
export interface BulkheadConfig {
    /** Máximo número de ejecuciones concurrentes */
    maxConcurrentCalls: number;

    /** Tamaño máximo de la cola de espera */
    maxQueueSize: number;

    /** Timeout máximo para esperar en cola (ms) */
    queueTimeoutMs: number;

    /** Si debe rechazar cuando la cola está llena */
    rejectWhenFull: boolean;

    /** Nombre del bulkhead para métricas */
    name: string;
}

export interface BulkheadMetrics {
    name: string;
    activeCalls: number;
    queuedCalls: number;
    maxConcurrentCalls: number;
    maxQueueSize: number;
    totalCalls: number;
    successfulCalls: number;
    rejectedCalls: number;
    timedOutCalls: number;
    averageDurationMs: number;
}

export class BulkheadRejectedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BulkheadRejectedError';
    }
}

export class BulkheadTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BulkheadTimeoutError';
    }
}

/**
 * Bulkhead principal
 */
export class Bulkhead {
    private activeCalls = 0;
    private queue: Array<{
        task: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (reason: any) => void;
        queuedAt: number;
    }> = [];

    // Métricas
    private totalCalls = 0;
    private successfulCalls = 0;
    private rejectedCalls = 0;
    private timedOutCalls = 0;
    private totalDurationMs = 0;

    constructor(private readonly config: BulkheadConfig) { }

    /**
     * Ejecuta una función dentro del bulkhead
     */
    async execute<T>(task: () => Promise<T>): Promise<T> {
        const callId = `${this.config.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();

        this.totalCalls++;

        // 1. Verificar si hay capacidad inmediata
        if (this.activeCalls < this.config.maxConcurrentCalls) {
            return this.runTask(task, callId, startTime);
        }

        // 2. Verificar si la cola está llena
        if (this.queue.length >= this.config.maxQueueSize) {
            if (this.config.rejectWhenFull) {
                this.rejectedCalls++;
                throw new BulkheadRejectedError(
                    `Bulkhead '${this.config.name}' is full. ` +
                    `Active: ${this.activeCalls}, Queue: ${this.queue.length}, Max: ${this.config.maxConcurrentCalls}`
                );
            } else {
                // Esperar un poco y reintentar (estrategia alternativa)
                return this.waitAndRetry(task, callId, startTime);
            }
        }

        // 3. Agregar a la cola
        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                // Remover de la cola
                const index = this.queue.findIndex(item => item.queuedAt === startTime);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                }

                this.timedOutCalls++;
                reject(new BulkheadTimeoutError(
                    `Bulkhead '${this.config.name}' timeout after ${this.config.queueTimeoutMs}ms`
                ));
            }, this.config.queueTimeoutMs);

            this.queue.push({
                task,
                resolve: (value) => {
                    clearTimeout(timeoutId);
                    resolve(value);
                },
                reject: (reason) => {
                    clearTimeout(timeoutId);
                    reject(reason);
                },
                queuedAt: startTime,
            });

            // Intentar procesar la cola
            this.processQueue();
        });
    }

    /**
     * Ejecuta la tarea directamente
     */
    private async runTask<T>(task: () => Promise<T>, callId: string, startTime: number): Promise<T> {
        this.activeCalls++;

        try {
            const result = await task();

            // Métricas de éxito
            this.successfulCalls++;
            this.totalDurationMs += Date.now() - startTime;

            return result;
        } catch (error) {
            // Error de la tarea (no del bulkhead)
            throw error;
        } finally {
            this.activeCalls--;
            this.processQueue();
        }
    }

    /**
     * Espera y reintenta (estrategia cuando rejectWhenFull = false)
     */
    private async waitAndRetry<T>(task: () => Promise<T>, callId: string, startTime: number): Promise<T> {
        const maxRetries = 3;
        const baseDelay = 100;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // Verificar si hay espacio
            if (this.activeCalls < this.config.maxConcurrentCalls) {
                return this.runTask(task, callId, startTime);
            }

            // Esperar con backoff exponencial
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        this.rejectedCalls++;
        throw new BulkheadRejectedError(
            `Bulkhead '${this.config.name}' rejected after ${maxRetries} retries`
        );
    }

    /**
     * Procesa la cola de tareas pendientes
     */
    private processQueue(): void {
        while (this.activeCalls < this.config.maxConcurrentCalls && this.queue.length > 0) {
            const next = this.queue.shift();
            if (!next) break;

            // Verificar timeout
            const waitTime = Date.now() - next.queuedAt;
            if (waitTime > this.config.queueTimeoutMs) {
                next.reject(new BulkheadTimeoutError(
                    `Task timed out after ${waitTime}ms in queue`
                ));
                this.timedOutCalls++;
                continue;
            }

            // Ejecutar tarea
            this.activeCalls++;
            next.task()
                .then(result => {
                    this.successfulCalls++;
                    next.resolve(result);
                })
                .catch(error => {
                    next.reject(error);
                })
                .finally(() => {
                    this.activeCalls--;
                    this.processQueue();
                });
        }
    }

    /**
     * Obtiene métricas actuales
     */
    getMetrics(): BulkheadMetrics {
        const avgDuration = this.successfulCalls > 0
            ? this.totalDurationMs / this.successfulCalls
            : 0;

        return {
            name: this.config.name,
            activeCalls: this.activeCalls,
            queuedCalls: this.queue.length,
            maxConcurrentCalls: this.config.maxConcurrentCalls,
            maxQueueSize: this.config.maxQueueSize,
            totalCalls: this.totalCalls,
            successfulCalls: this.successfulCalls,
            rejectedCalls: this.rejectedCalls,
            timedOutCalls: this.timedOutCalls,
            averageDurationMs: Math.round(avgDuration),
        };
    }

    /**
     * Verifica si puede aceptar más llamadas
     */
    canAccept(): boolean {
        return this.activeCalls < this.config.maxConcurrentCalls ||
            this.queue.length < this.config.maxQueueSize;
    }

    /**
     * Resetea las métricas
     */
    resetMetrics(): void {
        this.totalCalls = 0;
        this.successfulCalls = 0;
        this.rejectedCalls = 0;
        this.timedOutCalls = 0;
        this.totalDurationMs = 0;
    }
}
