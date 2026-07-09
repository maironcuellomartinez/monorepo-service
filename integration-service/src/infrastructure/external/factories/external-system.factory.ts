// src/infrastructure/external/factories/external-system.factory.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ExternalSystem } from '../../../domain/entities/external-system.entity';
// import { CircuitState } from '../../../domain/value-objects/circuit-state.vo';

@Injectable()
export class ExternalSystemFactory {
    constructor(private readonly configService: ConfigService) { }

    createFromConfig(systemId: string): ExternalSystem {
        const config = this.configService.get(`externalSystems.${systemId}`);

        if (!config) {
            throw new Error(`Configuration not found for system: ${systemId}`);
        }

        return new ExternalSystem(
            systemId,
            config.name,
            config.type,
            {
                baseUrl: config.baseUrl,
                timeout: config.timeout || 10000,
                retryPolicy: {
                    maxRetries: config.retryPolicy?.maxRetries || 3,
                    initialDelay: config.retryPolicy?.initialDelay || 1000,
                    maxDelay: config.retryPolicy?.maxDelay || 30000,
                    multiplier: config.retryPolicy?.multiplier || 2,
                    jitter: config.retryPolicy?.jitter || 0,
                    retryableStatusCodes: config.retryPolicy?.retryableStatusCodes || [500, 502, 503, 504],
                    retryableErrors: config.retryPolicy?.retryableErrors || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'],
                },
            }
        );
    }

    createMinervaSystem(): ExternalSystem {
        return this.createFromConfig('minerva');
    }
}