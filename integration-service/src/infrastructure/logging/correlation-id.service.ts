import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface CorrelationContext {
    correlationId: string;
}

/**
 * Propaga el correlationId dentro de un contexto asíncrono (AsyncLocalStorage).
 * Disponible globalmente via LoggingModule.
 */
@Injectable()
export class CorrelationIdService {
    private readonly storage = new AsyncLocalStorage<CorrelationContext>();

    run<T>(fn: () => T, correlationId?: string): T {
        const id = correlationId ?? crypto.randomUUID();
        return this.storage.run({ correlationId: id }, fn);
    }

    getCorrelationId(): string | undefined {
        return this.storage.getStore()?.correlationId;
    }
}
