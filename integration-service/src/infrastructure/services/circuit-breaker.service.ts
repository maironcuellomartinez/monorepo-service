// src/infrastructure/services/circuit-breaker.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExternalSystem } from '../entities/external-system.entity';
import { IExternalSystemRepository } from '../../domain/interfaces/repository.interface';

@Injectable()
export class CircuitBreakerService {
    private readonly logger = new Logger(CircuitBreakerService.name);
    private readonly failureThreshold = 5;
    private readonly resetTimeout = 30000; // 30 segundos

    constructor(
        private readonly eventEmitter: EventEmitter2,
        @Inject('IExternalSystemRepository')
        private readonly externalSystemRepository: IExternalSystemRepository,
    ) { }

    async execute<T>(
        system: ExternalSystem,
        operation: () => Promise<T>
    ): Promise<T> {
        if (system.circuitState === 'OPEN') {
            if (system.circuitOpenedAt) {
                const elapsed = Date.now() - system.circuitOpenedAt.getTime();
                if (elapsed >= this.resetTimeout) {
                    system.circuitState = 'HALF_OPEN';
                    await this.externalSystemRepository.update(system);
                    this.eventEmitter.emit('circuit.half_open', { systemId: system.id });
                } else {
                    throw new Error(`Circuit for ${system.name} is OPEN`);
                }
            } else {
                throw new Error(`Circuit for ${system.name} is OPEN`);
            }
        }

        try {
            const result = await operation();

            const wasHalfOpen = system.circuitState === 'HALF_OPEN';
            system.recordSuccess();
            await this.externalSystemRepository.update(system);

            if (wasHalfOpen) {
                this.eventEmitter.emit('circuit.closed', { systemId: system.id });
            }

            return result;

        } catch (error) {
            system.recordFailure();

            if (system.failureCount >= this.failureThreshold) {
                system.circuitState = 'OPEN';
                system.circuitOpenedAt = new Date();
                this.eventEmitter.emit('circuit.opened', {
                    systemId: system.id,
                    failureCount: system.failureCount,
                });
            }

            await this.externalSystemRepository.update(system);

            throw error;
        }
    }
}
