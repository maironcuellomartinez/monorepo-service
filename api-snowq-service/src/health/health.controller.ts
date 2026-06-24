import { Controller, Get, UseGuards } from '@nestjs/common';
import { HealthService } from './health.service';
import { M2mJwtGuard } from 'src/common/guards/m2m-jwt.guard';

@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    /** Liveness — sin auth, para load balancers y k8s */
    @Get('live')
    live() {
        return { status: 'alive', uptime: process.uptime(), ts: new Date().toISOString() };
    }

    /** Readiness — sin auth */
    @Get('ready')
    ready() {
        return { status: 'ready', ts: new Date().toISOString() };
    }

    /** Deep health — con auth, para el dashboard */
    @UseGuards(M2mJwtGuard)
    @Get('status')
    async status() {
        const [db, queue] = await Promise.all([
            this.healthService.checkDatabase(),
            this.healthService.getQueueCount(),
        ]);
        const cb = this.healthService.getCircuitBreakerSummary();

        const allUp = db.status === 'up' && cb.status === 'up';

        return {
            status: allUp ? 'alive' : 'degraded',
            uptime: process.uptime(),
            ts: new Date().toISOString(),
            checks: {
                database: db,
                circuitBreaker: { status: cb.status, state: cb.state },
                queue: { status: 'up', pendingCount: queue },
            },
        };
    }
}
