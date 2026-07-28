// src/presentation/controllers/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
    HealthCheck,
    HealthCheckService,
    MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private memory: MemoryHealthIndicator,
    ) { }

    @Get()
    @HealthCheck()
    @ApiOperation({ summary: 'Check service health' })
    check() {
        return this.health.check([
            () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
        ]);
    }

    @Get('readiness')
    @ApiOperation({ summary: 'Check service readiness' })
    readiness() {
        return {
            status: 'ready',
            timestamp: new Date().toISOString(),
            service: 'integration-service',
        };
    }

    @Get('liveness')
    @ApiOperation({ summary: 'Check service liveness' })
    liveness() {
        return {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        };
    }
}