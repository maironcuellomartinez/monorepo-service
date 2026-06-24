import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { context, trace, Span } from '@opentelemetry/api';

export interface CorrelationContext {
    correlationId: string;
    labels: Record<string, string>;
    span?: Span;
}

@Injectable()
export class CorrelationIdService {
    private readonly storage = new AsyncLocalStorage<CorrelationContext>();

    async run<T>(
        fn: () => Promise<T>,
        initial?: Partial<CorrelationContext>,
    ): Promise<T> {
        const correlationId = initial?.correlationId ?? randomUUID();

        const ctx: CorrelationContext = {
            correlationId,
            labels: initial?.labels ?? {},
        };

        return this.storage.run(ctx, async () => {
            const span = trace.getTracer(process.env.SERVICE_NAME ?? 'app').startSpan('correlation.run');
            ctx.span = span;

            return context.with(
                trace.setSpan(context.active(), span),
                async () => {
                    try {
                        return await fn();
                    } finally {
                        span.end();
                    }
                },
            );
        });
    }

    runWithContext<T>(ctx: CorrelationContext, fn: () => T): T {
        return this.storage.run(ctx, fn);
    }

    setContext(ctx: CorrelationContext): void {
        this.storage.enterWith(ctx);
    }

    getContext(): CorrelationContext | undefined {
        return this.storage.getStore();
    }

    getCorrelationId(): string | undefined {
        return this.getContext()?.correlationId;
    }

    getTraceId(): string | undefined {
        return trace.getSpan(context.active())?.spanContext().traceId;
    }

    getSpanId(): string | undefined {
        return trace.getSpan(context.active())?.spanContext().spanId;
    }

    addLabel(label: Record<string, string>): void {
        const ctx = this.getContext();
        if (!ctx) return;
        ctx.labels = { ...ctx.labels, ...label };
        ctx.span?.setAttributes(label);
    }

    getLabels(): Record<string, string> {
        return this.getContext()?.labels ?? {};
    }

    getSpan(): Span | undefined {
        return this.getContext()?.span;
    }
}
