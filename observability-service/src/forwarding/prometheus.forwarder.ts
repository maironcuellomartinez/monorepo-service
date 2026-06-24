import { IForwarder } from './forwarder.interface';

export class PrometheusForwarder implements IForwarder {
    constructor(private readonly pushgatewayUrl: string) {}

    async forwardLogs(_logs: any[]): Promise<void> {}

    async forwardSpans(_spans: any[]): Promise<void> {}

    async forwardMetrics(metrics: any[]): Promise<void> {
        if (!metrics.length) return;
        // Convert to Prometheus text format and push to pushgateway
        const lines: string[] = [];
        for (const m of metrics) {
            const labelStr = m.labels
                ? Object.entries(m.labels)
                      .map(([k, v]) => `${k}="${v}"`)
                      .join(',')
                : '';
            const name = m.name.replace(/[^a-zA-Z0-9_]/g, '_');
            lines.push(`${name}{${labelStr},service="${m.service}"} ${m.value}`);
        }
        const body = lines.join('\n') + '\n';
        await fetch(`${this.pushgatewayUrl}/metrics/job/observability-service`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body,
        });
    }
}
