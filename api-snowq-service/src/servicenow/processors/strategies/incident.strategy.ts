import { Injectable } from '@nestjs/common';
import { SnowRequestProcessor } from '../processor.interface';
import { ServiceNowService } from '../../servicenow.service';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';
import { RequestTypeUtils, ResponseServiceNowSuccess } from 'src/common';

@Injectable()
export class IncidentProcessor implements SnowRequestProcessor {
    constructor(private readonly serviceNowService: ServiceNowService) { }

    /**
     * Procesa una solicitud de incidente
     * @param request Solicitud de incidente
     * @returns Resultado del procesamiento de la solicitud
     * @example
     * ```typescript
     * const result = await this.incidentProcessor.process(request);
     * ```
     * @description This method processes an incident request by building the payload and sending it to ServiceNow.
     */
    async process(request: SnowRequestEntity): Promise<ResponseServiceNowSuccess> {
        const payload = RequestTypeUtils.buildPayloadForServiceNow(request);
        return this.serviceNowService.sendRequest(request, payload);
    }
}
