export interface IForwarder {
    forwardLogs(logs: any[]): Promise<void>;
    forwardSpans(spans: any[]): Promise<void>;
    forwardMetrics(metrics: any[]): Promise<void>;
}

export const FORWARDERS = Symbol('FORWARDERS');
