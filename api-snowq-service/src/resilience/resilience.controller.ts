import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { M2mJwtGuard } from 'src/common/guards/m2m-jwt.guard';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { BulkheadRegistry } from './bulkhead/bulkhead.registry';
import { TracingClient } from '../common/tracing.client';
import { CorrelationIdService } from '../common';

@UseGuards(M2mJwtGuard)
@Controller('resilience')
export class ResilienceController {
    constructor(
        private readonly circuitBreakerService: CircuitBreakerService,
        private readonly bulkheadRegistry: BulkheadRegistry,
        private readonly correlationIdService: CorrelationIdService,
    ) {}

    @Get('circuit-breaker/status')
    getCircuitBreakerStatus() {
        const all = this.circuitBreakerService.getAllMetrics();
        const open = this.circuitBreakerService.getOpenBreakers();

        return {
            state: open.length > 0 ? 'open' : 'closed',
            openCount: open.length,
            breakers: Object.fromEntries(
                Object.entries(all).map(([name, m]) => [name, {
                    state: m.state,
                    failureRate: `${m.failureRate.toFixed(1)}%`,
                    totalCalls: m.totalCalls,
                    failedCalls: m.failedCalls,
                    notPermittedCalls: m.notPermittedCalls,
                    bufferedCalls: m.bufferedCalls,
                }]),
            ),
        };
    }

    @Get('bulkhead/status')
    getBulkheadStatus() {
        const all = this.bulkheadRegistry.getAllMetrics();
        const overloaded = this.bulkheadRegistry.getOverloadedBulkheads();

        return {
            overloadedCount: overloaded.length,
            bulkheads: all,
        };
    }

    @Post('circuit-breaker/reset')
    resetCircuitBreakers() {
        return TracingClient.getInstance().run(
            'snowq.controller.resilience.reset',
            { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
            () => this._reset(),
        );
    }

    private async _reset() {
        this.circuitBreakerService.resetAll();
        const all = this.circuitBreakerService.getAllMetrics();
        return { reset: true, breakers: Object.keys(all) };
    }
}
