// infrastructure/event-handlers/event-handlers.module.ts
import { Module } from '@nestjs/common';
import { IncidentServiceNowHandler } from './incident-servicenow.handler';
import { IncidentStatusChangedHandler } from './incident-status-changed.handler';
import { RequestServiceNowHandler } from './request-servicenow.handler';

/**
 * Módulo de event handlers de infraestructura.
 * Se importa después de InfrastructureModule y CoreServicesModule para que
 * todos los tokens (IN_MEMORY_EVENT_BUS, SERVICENOW_INTEGRATION_SERVICE, etc.)
 * ya estén registrados en el contexto global de NestJS.
 */
@Module({
    providers: [
        IncidentServiceNowHandler,
        IncidentStatusChangedHandler,
        RequestServiceNowHandler,
    ],
})
export class EventHandlersModule { }
