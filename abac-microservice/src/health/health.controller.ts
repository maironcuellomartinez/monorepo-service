import { Controller, Get } from '@nestjs/common';
import {
    HealthCheck,
    HealthCheckService,
    TypeOrmHealthIndicator,
    MemoryHealthIndicator,
} from '@nestjs/terminus';

/**
 * No existía — deployment-abac.yaml apunta liveness/readiness a
 * /health/live y /health/ready desde el día uno, pero nadie los servía:
 * 404 en ambas probes → CrashLoopBackOff permanente. ABAC es el primer
 * servicio de la cadena de arranque, así que tumbaba todo lo demás.
 */
@Controller('health')
export class HealthController {
    constructor(
        private readonly health: HealthCheckService,
        private readonly db: TypeOrmHealthIndicator,
        private readonly memory: MemoryHealthIndicator,
    ) {}

    @Get('live')
    live() {
        return { status: 'alive', uptime: process.uptime(), ts: new Date().toISOString() };
    }

    @Get('ready')
    @HealthCheck()
    ready() {
        return this.health.check([
            () => this.db.pingCheck('database'),
            () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
        ]);
    }
}
