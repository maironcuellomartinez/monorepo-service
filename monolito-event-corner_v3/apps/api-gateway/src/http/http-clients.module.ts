import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@backendkit-labs/http-client/nestjs';
import type { HttpClientConfig, HttpCtx } from '@backendkit-labs/http-client';
import { CorrelationIdService } from '@app/observability';
import { MONOLITH_HTTP, ABAC_HTTP, ABAC_HTTP_NOCB } from './http-client.tokens';

/**
 * Registro central de los HTTP clients salientes del api-gateway, sobre
 * @backendkit-labs/http-client. Reemplaza al antiguo @app/http (HttpAxiosService).
 *
 * Tres clients:
 *   - MONOLITH_HTTP   → monolito, con circuit breaker.
 *   - ABAC_HTTP       → ABAC con circuit breaker (roles / batch / can-access).
 *   - ABAC_HTTP_NOCB  → ABAC sin circuit breaker (validación de token, auth crítica).
 *
 * El módulo es global (forRootAsync lo marca así), por lo que los tokens quedan
 * disponibles para inyección en cualquier módulo sin re-importar.
 */

/**
 * Step de pre-request que propaga el x-correlation-id actual a cada llamada,
 * replicando el comportamiento del antiguo HttpAxiosService.getCorrelationId.
 */
function correlationStep(cor: CorrelationIdService): NonNullable<HttpClientConfig['steps']>[number] {
    return {
        stepName: 'inject-correlation-id',
        async handle(ctx: HttpCtx) {
            const cid = cor.getCorrelationId();
            if (!cid) return { ok: true as const, value: ctx };
            return {
                ok: true as const,
                value: { ...ctx, headers: { ...ctx.headers, 'x-correlation-id': cid } },
            };
        },
    };
}

@Module({
    imports: [
        HttpClientModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService, CorrelationIdService],
            clients: [MONOLITH_HTTP, ABAC_HTTP, ABAC_HTTP_NOCB],
            useFactory: (cs: ConfigService, cor: CorrelationIdService) => {
                const monolithUrl = cs.get<string>('MONOLITH_URL', 'http://localhost:3001');
                const abacUrl = cs.get<string>('ABAC_URL', 'http://localhost:3005');
                const step = correlationStep(cor);

                return {
                    clients: [
                        {
                            token: MONOLITH_HTTP,
                            config: {
                                baseURL: monolithUrl,
                                timeout: 8_000,
                                retry: { attempts: 3 },
                                circuitBreaker: { name: 'monolith' },
                                steps: [step],
                            },
                        },
                        {
                            token: ABAC_HTTP,
                            config: {
                                baseURL: abacUrl,
                                timeout: 8_000,
                                retry: { attempts: 2 },
                                circuitBreaker: { name: 'abac' },
                                steps: [step],
                            },
                        },
                        {
                            token: ABAC_HTTP_NOCB,
                            config: {
                                baseURL: abacUrl,
                                timeout: 8_000,
                                retry: { attempts: 2 },
                                // sin circuitBreaker: la auth siempre intenta la red
                                steps: [step],
                            },
                        },
                    ],
                };
            },
        }),
    ],
})
export class HttpClientsModule {}
