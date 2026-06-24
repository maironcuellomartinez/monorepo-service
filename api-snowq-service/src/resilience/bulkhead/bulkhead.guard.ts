/**
 * Guard para aplicar bulkhead a nivel de endpoint
 */
import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ServiceUnavailableException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BulkheadRegistry } from './bulkhead.registry';

export const BULKHEAD_KEY = 'bulkhead';

export interface BulkheadOptions {
    /** Nombre del bulkhead */
    name?: string;

    /** Si usa bulkhead por cliente */
    perClient?: boolean;

    /** Límite de concurrencia */
    maxConcurrent?: number;

    /** Tiempo de espera */
    timeoutMs?: number;
}

export const UseBulkhead = (options: BulkheadOptions = {}) =>
    Reflector.createDecorator<BulkheadOptions>({
        key: BULKHEAD_KEY,
        transform: () => options,
    });

@Injectable()
export class BulkheadGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly bulkheadRegistry: BulkheadRegistry,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const options = this.reflector.get<BulkheadOptions>(
            BULKHEAD_KEY,
            context.getHandler(),
        );

        if (!options) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const clientId = request.headers['x-client-id'] || 'anonymous';

        // Determinar qué bulkhead usar
        let bulkhead;
        if (options.perClient) {
            bulkhead = this.bulkheadRegistry.getForClient(
                clientId,
                options.name || request.route.path
            );
        } else if (options.name) {
            bulkhead = this.bulkheadRegistry.getForService(options.name);
        } else {
            bulkhead = this.bulkheadRegistry.getForService('default');
        }

        // Verificar si puede aceptar
        if (!bulkhead.canAccept()) {
            throw new ServiceUnavailableException(
                'Service temporarily unavailable due to high load'
            );
        }

        // Guardar bulkhead en request para uso posterior
        (request as any).bulkhead = bulkhead;

        return true;
    }
}
