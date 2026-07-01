import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { M2mJwtGuard } from 'src/common/guards/m2m-jwt.guard';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { TracingClient } from '../common/tracing.client';

@UseGuards(M2mJwtGuard)
@Controller('resilience')
export class ResilienceController {
    constructor(private readonly circuitBreakerService: CircuitBreakerService) {}

    @Get('circuit-breaker/status')
    getStatus() {
        const allBreakers = this.circuitBreakerService.getAllBreakers();
        const breakerDetails: Record<string, any> = {};

        let totalRequests = 0;
        let totalFailures = 0;
        let totalSuccesses = 0;
        let anyOpen = false;

        for (const [key, breaker] of allBreakers) {
            const stats = breaker.status.stats;
            const state = breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed';
            if (state === 'open') anyOpen = true;

            breakerDetails[key] = {
                state,
                failures: stats.failures,
                successes: stats.successes,
                requests: stats.fires,
                timeouts: stats.timeouts,
                rejects: stats.rejects,
            };

            totalRequests += stats.fires ?? 0;
            totalFailures += stats.failures ?? 0;
            totalSuccesses += stats.successes ?? 0;
        }

        const overallState = anyOpen ? 'open' : allBreakers.size === 0 ? 'closed' : 'closed';
        const failureRate = totalRequests > 0 ? Math.round((totalFailures / totalRequests) * 100) : 0;

        return {
            state: overallState,
            failureRate,
            failureCount: totalFailures,
            successCount: totalSuccesses,
            totalRequests,
            totalFailures,
            totalSuccesses,
            breakers: breakerDetails,
        };
    }

    @Post('circuit-breaker/reset')
    reset() {
        return TracingClient.getInstance().run(
            'snowq.controller.resilience.reset',
            { kind: 'server' },
            () => this._reset(),
        );
    }

    private _reset() {
        const allBreakers = this.circuitBreakerService.getAllBreakers();
        for (const [, breaker] of allBreakers) {
            breaker.close();
        }
        return { reset: true, count: allBreakers.size };
    }
}
