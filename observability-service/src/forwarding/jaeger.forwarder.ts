import { IForwarder } from './forwarder.interface';

export class JaegerForwarder implements IForwarder {
    constructor(private readonly otlpUrl: string) {}

    async forwardLogs(_logs: any[]): Promise<void> {
        // Jaeger does not ingest logs — no-op
    }

    async forwardSpans(spans: any[]): Promise<void> {
        if (!spans.length) return;
        await fetch(`${this.otlpUrl}/v1/traces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resourceSpans: spans }),
        });
    }

    async forwardMetrics(_metrics: any[]): Promise<void> {
        // Jaeger does not ingest metrics — no-op
    }
}
