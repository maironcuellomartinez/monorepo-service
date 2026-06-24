import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CircuitBreakerService } from 'src/resilience/circuit-breaker';

@Injectable()
export class HealthService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly circuitBreakerService: CircuitBreakerService,
    ) {}

    async checkDatabase(): Promise<{ status: 'up' | 'down'; responseTimeMs?: number }> {
        const t0 = Date.now();
        try {
            await this.dataSource.query('SELECT 1');
            return { status: 'up', responseTimeMs: Date.now() - t0 };
        } catch {
            return { status: 'down' };
        }
    }

    getCircuitBreakerSummary(): { status: 'up' | 'down'; state: string; breakers: Record<string, string> } {
        const allBreakers = this.circuitBreakerService.getAllBreakers();
        const breakers: Record<string, string> = {};
        let anyOpen = false;

        for (const [key, breaker] of allBreakers) {
            const state = breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed';
            breakers[key] = state;
            if (state === 'open') anyOpen = true;
        }

        return {
            status: anyOpen ? 'down' : 'up',
            state: anyOpen ? 'open' : 'closed',
            breakers,
        };
    }

    async getQueueCount(): Promise<number> {
        try {
            const result = await this.dataSource.query(
                `SELECT COUNT(*) as count FROM snow_requests WHERE status = 'QUEUED'`,
            );
            return parseInt(result[0]?.count ?? '0', 10);
        } catch {
            return 0;
        }
    }
}
