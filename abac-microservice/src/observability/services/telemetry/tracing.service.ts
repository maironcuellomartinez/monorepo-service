import { Injectable } from "@nestjs/common";
import { context, Span, SpanKind, SpanStatusCode, trace, Tracer } from "@opentelemetry/api";

@Injectable()
export class TracingService {
    private readonly tracer: Tracer;

    constructor() {
        this.tracer = trace.getTracer(
            process.env.SERVICE_NAME ?? 'unknown-service',
        );
    }

    /**
     * Ejecuta una función dentro de un span activo
     * 
     * @example
     * ```typescript
     * await this.tracingService.run('my-span', { attributes: { foo: 'bar' }, kind: SpanKind.CLIENT }, async () => {
     *     // tu código aquí
     * });
     * 
     * ```
     * 
     * @param name El nombre del span
     * @param options Opciones para el span
     * @param fn La función a ejecutar dentro del span
     * @returns El resultado de la función
     * @description Este método es útil para rastrear la ejecución de una función dentro de un span activo,
     * retorna el resultado de la función ejecutada. 
     */
    async run<T>(
        name: string,
        options: {
            attributes?: Record<string, string | number | boolean>;
            kind?: SpanKind;
        } = {},
        fn: () => Promise<T>,
    ): Promise<T> {
        return context.with(
            trace.setSpan(
                context.active(),
                this.tracer.startSpan(name, {
                    kind: options.kind ?? SpanKind.INTERNAL,
                    attributes: options.attributes,
                }),
            ),
            async () => {
                const span = trace.getSpan(context.active());

                try {
                    return await fn();
                } catch (error) {
                    span?.recordException(error as Error);
                    span?.setStatus({ code: SpanStatusCode.ERROR });
                    throw error;
                } finally {
                    span?.end();
                }
            },
        );
    }

    /**
     * Crea un span hijo manual (casos avanzados)
     */
    startChildSpan(name: string, attributes?: Record<string, any>): Span {
        return this.tracer.startSpan(name, { attributes });
    }
}
