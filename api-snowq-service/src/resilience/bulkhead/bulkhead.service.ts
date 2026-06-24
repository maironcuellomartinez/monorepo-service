/**
 * Servicio para monitorear y gestionar bulkheads
 */
import { Injectable, Logger } from '@nestjs/common';
import { BulkheadRegistry } from './bulkhead.registry';
import { BulkheadMetrics } from './bulkhead';

@Injectable()
export class BulkheadService {
    private readonly logger = new Logger(BulkheadService.name);

    constructor(private readonly registry: BulkheadRegistry) {
        // Iniciar monitoreo
        this.startMonitoring();
    }

    /**
     * Obtiene todas las métricas
     */
    getAllMetrics(): Record<string, BulkheadMetrics> {
        return this.registry.getAllMetrics();
    }

    /**
     * Obtiene bulkheads en estado crítico
     */
    getCriticalBulkheads(): BulkheadMetrics[] {
        const all = this.registry.getAllMetrics();
        const critical: BulkheadMetrics[] = [];

        for (const metrics of Object.values(all)) {
            const utilization = metrics.activeCalls / metrics.maxConcurrentCalls;

            if (utilization > 0.9) {
                critical.push(metrics);
            }
        }

        return critical;
    }

    /**
     * Resetea métricas
     */
    resetMetrics(name?: string): void {
        if (name) {
            const bulkhead = this.registry.getOrCreate({ name });
            bulkhead.resetMetrics();
        } else {
            this.registry.resetAllMetrics();
        }
    }

    /**
     * Inicia monitoreo periódico
     */
    private startMonitoring(): void {
        setInterval(() => {
            const critical = this.getCriticalBulkheads();

            if (critical.length > 0) {
                this.logger.warn(
                    `Critical bulkheads detected: ${critical.length}`,
                    critical.map(c => ({
                        name: c.name,
                        utilization: `${Math.round((c.activeCalls / c.maxConcurrentCalls) * 100)}%`,
                        queued: c.queuedCalls,
                    }))
                );
            }
        }, 60000); // Cada minuto
    }
}
