/**
 * Registry para gestionar múltiples bulkheads
 * Cada cliente/servicio puede tener su propio bulkhead
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bulkhead, BulkheadConfig, BulkheadMetrics } from './bulkhead';

export interface BulkheadOptions extends Partial<BulkheadConfig> {
    name: string;
}

@Injectable()
export class BulkheadRegistry implements OnModuleInit {
    private bulkheads = new Map<string, Bulkhead>();
    private defaultConfig: Omit<BulkheadConfig, 'name'> = {
        maxConcurrentCalls: 10,
        maxQueueSize: 100,
        queueTimeoutMs: 30000,
        rejectWhenFull: true,
    };

    onModuleInit() {
        // Inicializar bulkheads por defecto
        this.createDefaultBulkheads();
    }

    /**
     * Obtiene o crea un bulkhead
     */
    getOrCreate(options: BulkheadOptions): Bulkhead {
        const key = options.name;

        if (!this.bulkheads.has(key)) {
            const config: BulkheadConfig = {
                ...this.defaultConfig,
                ...options,
                name: options.name,
            };

            this.bulkheads.set(key, new Bulkhead(config));
        }

        return this.bulkheads.get(key)!;
    }

    /**
     * Obtiene bulkhead para un cliente específico
     */
    getForClient(clientId: string, endpoint?: string): Bulkhead {
        const name = endpoint
            ? `client:${clientId}:${endpoint}`
            : `client:${clientId}`;

        return this.getOrCreate({
            name,
            maxConcurrentCalls: 5,  // Límite más bajo por cliente
            maxQueueSize: 20,
        });
    }

    /**
     * Obtiene bulkhead para un servicio/módulo
     */
    getForService(serviceName: string): Bulkhead {
        return this.getOrCreate({
            name: `service:${serviceName}`,
            maxConcurrentCalls: 20,  // Límite más alto para servicios internos
            maxQueueSize: 200,
        });
    }

    /**
     * Obtiene bulkhead para ABAC service
     */
    getForAbac(clientId?: string): Bulkhead {
        if (clientId) {
            return this.getOrCreate({
                name: `abac:${clientId}`,
                maxConcurrentCalls: 3,    // ABAC es crítico, limitar concurrencia
                maxQueueSize: 50,
                queueTimeoutMs: 5000,      // Timeout más corto para ABAC
            });
        }

        return this.getOrCreate({
            name: 'abac:global',
            maxConcurrentCalls: 10,
            maxQueueSize: 100,
            queueTimeoutMs: 5000,
        });
    }

    /**
     * Obtiene bulkhead para base de datos
     */
    getForDatabase(schema: string): Bulkhead {
        return this.getOrCreate({
            name: `database:${schema}`,
            maxConcurrentCalls: 15,
            maxQueueSize: 150,
            rejectWhenFull: true,
        });
    }

    /**
     * Obtiene bulkhead para HTTP externo
     */
    getForHttpExternal(serviceName: string): Bulkhead {
        return this.getOrCreate({
            name: `http:${serviceName}`,
            maxConcurrentCalls: 8,
            maxQueueSize: 50,
            queueTimeoutMs: 10000,
        });
    }

    /**
     * Obtiene bulkhead para llamadas a ServiceNow.
     * Limita la presión sobre el servicio externo independientemente
     * de cuántas requests HTTP entren al servicio.
     */
    getForServiceNow(): Bulkhead {
        return this.getOrCreate({
            name: 'servicenow:api',
            maxConcurrentCalls: 8,   // ServiceNow no tolera muchas concurrentes
            maxQueueSize: 40,
            queueTimeoutMs: 15000,   // 15s — tiempo razonable para una llamada HTTP a ServiceNow
            rejectWhenFull: true,
        });
    }

    /**
     * Crea bulkheads por defecto
     */
    private createDefaultBulkheads(): void {
        // Endpoints asíncronos — operación rápida (solo encola + persiste)
        this.getOrCreate({
            name: 'snow-requests:async',
            maxConcurrentCalls: 30,
            maxQueueSize: 200,
            queueTimeoutMs: 5000,
        });

        // Endpoints inmediatos — operación lenta (espera respuesta de ServiceNow)
        this.getOrCreate({
            name: 'snow-requests:immediate',
            maxConcurrentCalls: 10,
            maxQueueSize: 20,
            queueTimeoutMs: 30000,
        });

        // Llamadas HTTP hacia ServiceNow
        this.getForServiceNow();
    }

    /**
     * Obtiene métricas de todos los bulkheads
     */
    getAllMetrics(): Record<string, BulkheadMetrics> {
        const metrics: Record<string, BulkheadMetrics> = {};

        for (const [name, bulkhead] of this.bulkheads) {
            metrics[name] = bulkhead.getMetrics();
        }

        return metrics;
    }

    /**
     * Resetea todas las métricas
     */
    resetAllMetrics(): void {
        for (const bulkhead of this.bulkheads.values()) {
            bulkhead.resetMetrics();
        }
    }

    /**
     * Obtiene bulkheads sobrecargados
     */
    getOverloadedBulkheads(): BulkheadMetrics[] {
        const overloaded: BulkheadMetrics[] = [];

        for (const bulkhead of this.bulkheads.values()) {
            const metrics = bulkhead.getMetrics();

            if (metrics.activeCalls >= metrics.maxConcurrentCalls * 0.8) {
                overloaded.push(metrics);
            }
        }

        return overloaded;
    }
}
