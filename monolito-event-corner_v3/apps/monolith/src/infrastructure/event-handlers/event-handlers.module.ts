// infrastructure/event-handlers/event-handlers.module.ts
import { Module } from '@nestjs/common';
import { AppointmentServiceNowHandler } from './appointment-servicenow.handler';
import { AppointmentStatusChangedHandler } from './appointment-status-changed.handler';

/**
 * Módulo de event handlers de infraestructura.
 * Se importa después de InfrastructureModule y CoreServicesModule para que
 * todos los tokens (IN_MEMORY_EVENT_BUS, SERVICENOW_INTEGRATION_SERVICE, etc.)
 * ya estén registrados en el contexto global de NestJS.
 *
 * Reemplaza IncidentServiceNowHandler + IncidentStatusChangedHandler +
 * RequestServiceNowHandler (retirados junto con IncidentService/RequestService
 * — internal-api ya enruta exclusivamente por AppointmentService).
 */
@Module({
    providers: [
        AppointmentServiceNowHandler,
        AppointmentStatusChangedHandler,
    ],
})
export class EventHandlersModule { }
