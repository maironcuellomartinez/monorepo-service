import { otelSDK } from './otel.sdk';

/**
 * Registra hooks de apagado del proceso
 * Garantiza flush y shutdown correcto de OpenTelemetry
 */
export function registerOtelShutdownHooks(): void {
    const shutdown = async (signal: string) => {
        try {
            console.log(`[otel] received ${signal}, shutting down...`);

            /**
             * Fuerza flush de spans y métricas pendientes
             * IMPORTANTE: shutdown() incluye forceFlush internamente
             */
            await otelSDK.shutdown();

            console.log('[otel] shutdown completed');
        } catch (error) {
            console.error('[otel] shutdown failed', error);
        } finally {
            process.exit(0);
        }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGHUP', shutdown);
}
