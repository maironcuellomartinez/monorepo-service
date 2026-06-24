import { Injectable, Logger } from '@nestjs/common';
import {
    HealthCheckService,
    TypeOrmHealthIndicator,
    MemoryHealthIndicator,
    DiskHealthIndicator,
} from '@nestjs/terminus';
import { GatewayClient } from '../../gateway/gateway.client';
import { HttpBulkheadMiddleware } from '@backendkit-labs/bulkhead/nestjs';

@Injectable()
export class HealthService {
    private readonly logger = new Logger(HealthService.name);
    readonly startTime: number = Date.now();

    constructor(
        private readonly health: HealthCheckService,
        private readonly db: TypeOrmHealthIndicator,
        private readonly memory: MemoryHealthIndicator,
        private readonly disk: DiskHealthIndicator,
        private readonly gateway: GatewayClient,
        private readonly bulkhead: HttpBulkheadMiddleware,
    ) { }

    async getStatus() {
        const gateway = this.safeCall(() => this.gateway.getStatus(), 'GatewayClient no disponible');
        const bulkhead = this.safeCall(() => this.bulkhead.getStats(), 'Bulkhead no disponible');

        const diskPath = process.platform === 'win32' ? 'C:\\' : '/';

        let terminusResult: Record<string, unknown> = {};
        try {
            terminusResult = await this.health.check([
                () => this.db.pingCheck('database', { timeout: 1000 }),
                () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
                () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
                () => this.disk.checkStorage('disk_storage', { thresholdPercent: 0.9, path: diskPath }),
            ]) as Record<string, unknown>;
        } catch (err: any) {
            terminusResult = err?.response ?? { status: 'error', error: String(err?.message ?? err) };
            this.logger.warn(`Health check degradado: ${err?.message}`);
        }

        return { ...terminusResult, gateway, bulkhead };
    }

    getPing() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
        };
    }

    private safeCall<T extends object>(fn: () => T, fallbackMessage: string): T | { error: string } {
        try {
            return fn();
        } catch (err) {
            this.logger.warn(`Health metric fallback: ${fallbackMessage} — ${(err as Error).message}`);
            return { error: fallbackMessage };
        }
    }
}
