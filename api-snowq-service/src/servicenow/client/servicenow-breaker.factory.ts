import { Injectable } from '@nestjs/common';
import { CircuitBreaker } from '@backendkit-labs/circuit-breaker';
import { CircuitBreakerService } from 'src/resilience/circuit-breaker';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';

/**
 * Selecciona el circuit breaker correcto según el flujo del request:
 *
 *   immediate=true      → sn:immediate (modo síncrono, timeout más corto)
 *   source=nagios-thruk → sn:monitoring (aislado del tráfico del monolito)
 *   cualquier otro      → sn:queue     (cola asíncrona)
 *
 * Esta separación garantiza que una tormenta de alertas Nagios que abre
 * sn:monitoring no afecte al flujo de incidencias del monolito (sn:queue).
 */
@Injectable()
export class ServiceNowBreakerFactory {
    constructor(private readonly circuitBreakerService: CircuitBreakerService) {}

    getBreakerForEntity(entity: SnowRequestEntity): CircuitBreaker {
        if (entity.immediate)               return this.circuitBreakerService.getBreaker('sn:immediate');
        if (entity.source === 'nagios-thruk') return this.circuitBreakerService.getBreaker('sn:monitoring');
        return this.circuitBreakerService.getBreaker('sn:queue');
    }
}
