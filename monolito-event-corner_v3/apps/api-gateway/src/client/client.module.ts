// api-gateway/client/client.module.ts
import { Module } from '@nestjs/common';
import { MicornerClient } from './micorner.client';

/**
 * El HttpClient del micorner (token MICORNER_HTTP) se registra de forma global
 * en HttpClientsModule, por lo que aquí solo declaramos el consumidor.
 */
@Module({
    providers: [MicornerClient],
    exports: [MicornerClient],
})
export class ClientModule {}
