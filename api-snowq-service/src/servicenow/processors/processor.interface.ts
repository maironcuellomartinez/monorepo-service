import { ResponseServiceNowSuccess } from 'src/common';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';

export interface SnowRequestProcessor {
    process(request: SnowRequestEntity): Promise<ResponseServiceNowSuccess>;
}
