import { Injectable } from '@nestjs/common';
import { SnowRequestProcessor } from '../processor.interface';
import { ServiceNowService } from '../../servicenow.service';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';
import { RequestTypeUtils, ResponseServiceNowSuccess } from 'src/common';

@Injectable()
export class ReleaseTaskProcessor implements SnowRequestProcessor {
    constructor(private readonly serviceNowService: ServiceNowService) {}

    async process(request: SnowRequestEntity): Promise<ResponseServiceNowSuccess> {
        const payload = RequestTypeUtils.buildPayloadForServiceNow(request);
        return this.serviceNowService.sendRequest(request, payload);
    }
}
