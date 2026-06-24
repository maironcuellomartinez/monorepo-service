import { Controller, Get, Headers, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';
import * as crypto from 'crypto';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
    private readonly statusToken: string | undefined = process.env.HEALTH_STATUS_TOKEN;

    constructor(private readonly healthService: HealthService) {}

    @Get('status')
    @ApiOperation({
        summary: 'Estado del servicio con metricas de resiliencia',
        description: 'En produccion, restringir acceso por red o configurar HEALTH_STATUS_TOKEN.',
    })
    @ApiHeader({ name: 'x-health-token', required: false, description: 'Token requerido si HEALTH_STATUS_TOKEN esta configurado' })
    async getStatus(@Headers('x-health-token') token?: string) {
        if (this.statusToken) {
            const provided = token ?? '';
            const tokenBuf = Buffer.from(this.statusToken);
            const providedBuf = Buffer.from(provided);
            const valid = tokenBuf.length === providedBuf.length &&
                crypto.timingSafeEqual(tokenBuf, providedBuf);
            if (!valid) throw new ForbiddenException('x-health-token invalido');
        }
        return this.healthService.getStatus();
    }

    @Get('ping')
    @ApiOperation({ summary: 'Ping liviano — solo verifica que el proceso esta vivo (sin auth)' })
    ping() {
        return this.healthService.getPing();
    }
}
