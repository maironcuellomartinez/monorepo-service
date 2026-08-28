// infrastructure/infrastructure.module.ts
import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmPersistenceModule } from './persistence/typeorm/typeorm-persistence.module';
import { OutboxEventEntity } from './persistence/typeorm/entities/outbox-event.entity';
import { LocalCacheAdapter } from './cache/local-cache.adapter';
import { InMemoryEventBusAdapter } from './event-bus/in-memory-event-bus.adapter';
import { OutboxEventBusAdapter } from './event-bus/outbox-event-bus.adapter';
import { OutboxWorkerService } from './event-bus/outbox-worker.service';
import { InventoryHttpAdapter } from './external/inventory/inventory-http.adapter';
import { ServiceNowProxyAdapter } from './external/servicenow/servicenow-proxy.adapter';
import { EVENT_BUS, IN_MEMORY_EVENT_BUS, CACHE, EXTERNAL_INVENTORY_SERVICE, SERVICENOW_CLIENT, HOLIDAY_PROVIDER } from '@app/core/ports/outgoing/infrastructure-tokens';
import { LocalHolidayProvider } from '@app/date';

/**
 * Módulo global de infraestructura.
 * Registra y exporta todos los adaptadores de salida (repositorios, cache, event bus)
 * como providers globales para que CoreServicesModule pueda inyectarlos sin
 * necesidad de importar explícitamente cada módulo de infraestructura.
 *
 * Todas las comunicaciones hacia servicios externos (ServiceNow, Inventario)
 * se enrutan a través del API Gateway (API_GATEWAY_URL).
 *
 * Event Bus — patrón Outbox:
 *   IN_MEMORY_EVENT_BUS → InMemoryEventBusAdapter  (dispatch en proceso, usado por el worker)
 *   EVENT_BUS           → OutboxEventBusAdapter    (persiste en DB antes de despachar)
 *   OutboxWorkerService                            (poll cada 5 s → despacha pendientes)
 */
@Global()
@Module({
    imports: [
        TypeOrmPersistenceModule,
        TypeOrmModule.forFeature([OutboxEventEntity]),
        HttpModule.register({ timeout: 5000, maxRedirects: 3 }),
        ConfigModule,
    ],
    providers: [
        LocalCacheAdapter,
        { provide: CACHE, useExisting: LocalCacheAdapter },
        InMemoryEventBusAdapter,
        { provide: IN_MEMORY_EVENT_BUS, useExisting: InMemoryEventBusAdapter },
        OutboxEventBusAdapter,
        { provide: EVENT_BUS, useExisting: OutboxEventBusAdapter },
        OutboxWorkerService,
        InventoryHttpAdapter,
        { provide: EXTERNAL_INVENTORY_SERVICE, useExisting: InventoryHttpAdapter },
        ServiceNowProxyAdapter,
        { provide: SERVICENOW_CLIENT, useExisting: ServiceNowProxyAdapter },
        {
            provide: HOLIDAY_PROVIDER,
            useFactory: () => new LocalHolidayProvider([], 'AR'),
        },
    ],
    exports: [
        TypeOrmPersistenceModule,
        CACHE,
        EVENT_BUS,
        IN_MEMORY_EVENT_BUS,
        EXTERNAL_INVENTORY_SERVICE,
        SERVICENOW_CLIENT,
        HOLIDAY_PROVIDER,
    ],
})
export class InfrastructureModule { }
