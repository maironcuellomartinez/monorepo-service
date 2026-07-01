import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreakerOpenError } from '@backendkit-labs/circuit-breaker';
import { ResponseServiceNowSuccess } from 'src/common';
import { ServiceNowBreakerFactory } from './client/servicenow-breaker.factory';
import { ServiceNowClientService } from './client/servicenow-client.service';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';

@Injectable()
export class ServiceNowService {
    private readonly logger = new Logger(ServiceNowService.name);

    constructor(
        private readonly breakerFactory: ServiceNowBreakerFactory,
        private readonly serviceNowClient: ServiceNowClientService,
    ) {}

    async sendRequest(entity: SnowRequestEntity, payload: Record<string, any>): Promise<ResponseServiceNowSuccess> {
        const breaker = this.breakerFactory.getBreakerForEntity(entity);

        try {
            const result = await breaker.execute(
                () => this.serviceNowClient.postToServiceNow(entity.type, payload),
            );
            this.logger.log(`✔️ ${entity.internalNumber} → sys_id=${result.result.sys_id} number=${result.result.number} [cb=${breaker.getMetrics().name}]`);
            return result;
        } catch (error) {
            if (error instanceof CircuitBreakerOpenError) {
                this.logger.warn(`🔴 Circuit abierto [${breaker.getMetrics().name}] — ${entity.internalNumber} rechazado`);
            } else {
                this.logger.error(`❌ ${entity.internalNumber} → ${error?.message}`);
            }
            throw error;
        }
    }
}
