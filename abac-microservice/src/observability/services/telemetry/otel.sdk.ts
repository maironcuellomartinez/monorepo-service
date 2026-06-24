/**
 * OTel SDK stub — SDK packages (@opentelemetry/sdk-node, etc.) not installed.
 * Tracing/metrics use the no-op implementations from @opentelemetry/api.
 * Replace this file with a full NodeSDK init when the SDK packages are added.
 */
export const otelSDK = {
    start: async () => { },
    shutdown: async () => { },
};

export async function initOpenTelemetry(): Promise<void> {
    // No-op: SDK not configured — @opentelemetry/api no-op providers are used
}
