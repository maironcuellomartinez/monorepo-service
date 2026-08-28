import { Controller, Get } from '@nestjs/common';
import {
    HealthCheck,
    HealthCheckService,
    MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Sondas de salud — públicas a propósito.
 *
 * JwtGuard está montado como APP_GUARD global (auth/auth.module.ts), así que
 * sin @Public() estas rutas responden 401. Un health check autenticado no
 * sirve como sonda: devuelve el mismo 401 con el servicio sano que con el
 * servicio roto, así que no distingue "vivo" de "caído". Y quien sondea
 * —PM2, Apache delante en staging/prod, un balanceador— no tiene ni va a
 * tener un Bearer M2M EdDSA que mandar.
 *
 * No exponen nada sensible: /live es uptime y timestamp, /ready es un chequeo
 * de heap. Ningún dato de negocio ni de configuración.
 */
@Public()
@Controller('health')
export class HealthController {
    constructor(
        private readonly health: HealthCheckService,
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
            () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
        ]);
    }
}
