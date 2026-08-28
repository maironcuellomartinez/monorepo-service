import { Controller, Get } from '@nestjs/common';
import {
    HealthCheck,
    HealthCheckService,
    TypeOrmHealthIndicator,
    MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../internal-api/decorators/public.decorator';

/**
 * Sondas de salud — públicas a propósito.
 *
 * InternalTokenGuard está montado como APP_GUARD y alcanza toda la app, así
 * que sin @Public() estas rutas responden 401. Un health check autenticado no
 * sirve como sonda: devuelve el mismo 401 con el servicio sano que con el
 * servicio roto, así que no distingue "vivo" de "caído". Y quien sondea —PM2,
 * un balanceador— no tiene un Bearer M2M EdDSA que mandar.
 *
 * /live es uptime y timestamp; /ready comprueba la conexión a la base y el
 * heap. El estado de la DB se reduce a up/down, sin credenciales ni DSN.
 */
@Public()
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
