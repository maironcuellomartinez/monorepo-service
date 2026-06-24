import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from "@nestjs/axios";
import { ResponseServiceNowSuccess } from 'src/common';
import { ServiceNowBreakerFactory } from "./client/servicenow-breaker.factory";
import { ServiceNowClientService } from "./client/servicenow-client.service";
import { SnowRequestEntity } from "src/snow-requests/entities/snow-request.entity";

@Injectable()
export class ServiceNowService {
    private readonly logger = new Logger(ServiceNowService.name);

    constructor(
        private readonly breakerFactory: ServiceNowBreakerFactory,
        private readonly serviceNowClient: ServiceNowClientService,

    ) { }

    /**
     * Envía una incidencia a ServiceNow
     * @example
     * const response = await serviceNowService.sendRequest(incidence, payload);
     * @param incidence Incidencia a enviar
     * @param payload Payload de la incidencia
     * @returns ResponseServiceNowSuccess
     */
    async sendRequest(incidence: SnowRequestEntity, payload: Record<string, any>): Promise<ResponseServiceNowSuccess> {
        const breaker = this.breakerFactory.createBreakerForRequestType(
            incidence.type,
            () => this.serviceNowClient.postToServiceNow(incidence.type, payload),
            {
                timeout: 10000,
                errorThresholdPercentage: 50,
                resetTimeout: 30000
            }
        );

        try {
            const result = await breaker.fire();
            this.logger.log(`✔️ ${incidence.internalNumber} enviado a ServiceNow → sys_id: ${result.result.sys_id} | number: ${result.result.number}`);
            return result;
        } catch (error) {
            this.logger.error(`❌ Error enviando ${incidence.internalNumber} → ${error.message}`);
            throw error;
        }
    }
}
