// api-gateway/client/client.module.ts
import { Module } from '@nestjs/common';
import { MonolithClient } from './monolith.client';

/**
 * El HttpClient del monolito (token MONOLITH_HTTP) se registra de forma global
 * en HttpClientsModule, por lo que aquí solo declaramos el consumidor.
 */
@Module({
    providers: [MonolithClient],
    exports: [MonolithClient],
})
export class ClientModule {}
