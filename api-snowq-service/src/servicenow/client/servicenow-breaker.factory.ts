import { Injectable } from '@nestjs/common';
import CircuitBreaker, { Options } from 'opossum';
import { CircuitBreakerService } from 'src/resilience/circuit-breaker';
import { RequestType } from 'src/common';

@Injectable()
export class ServiceNowBreakerFactory {
    constructor(private readonly circuitBreakerService: CircuitBreakerService) { }

    createBreakerForRequestType(
        requestType: RequestType,
        action: (...args: any[]) => Promise<any>,
        options?: Options
    ): CircuitBreaker<any, any> {
        const breakerKey = `servicenow-${requestType}`;
        return this.circuitBreakerService.create(breakerKey, action, options);
    }
}
