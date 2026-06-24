import { BulkheadRegistry } from "./bulkhead.registry";

/**
 * Decorador para aplicar bulkhead a métodos específicos
 * @param {string} name Nombre del bulkhead
 * @param {number} maxConcurrent Número máximo de llamadas concurrentes
 * @param {number} timeoutMs Tiempo máximo de espera en la cola
 * @returns {Function} Decorador
 * @description This decorator is used to apply bulkhead to methods of a class.
 */
export function WithBulkhead(options: {
    name: string;
    maxConcurrent?: number;
    timeoutMs?: number;
}) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            // Obtener bulkhead registry (debe estar disponible en el contexto)
            const registry: BulkheadRegistry = (this as any).bulkheadRegistry;

            if (!registry) {
                throw new Error(
                    'BulkheadRegistry not available. ' +
                    'Make sure to inject it in the class constructor.'
                );
            }

            // Obtener bulkhead
            const bulkhead = registry.getOrCreate({
                name: options.name,
                maxConcurrentCalls: options.maxConcurrent || 5,
                queueTimeoutMs: options.timeoutMs || 30000,
                maxQueueSize: 50,
                rejectWhenFull: true,
            });

            // Ejecutar con bulkhead
            return await bulkhead.execute(() => originalMethod.apply(this, args));
        };

        return descriptor;
    };
}
