// api-gateway/outbound/outbound-gateway.module.ts
import { Module } from '@nestjs/common';
import { ServiceNowOutboundModule } from './servicenow/servicenow-outbound.module';
import { InventoryOutboundModule } from './inventory/inventory-outbound.module';
import { IntegrationOutboundModule } from './integration/integration-outbound.module';

/**
 * Módulo raíz del Outbound Gateway.
 * Agrupa todos los adaptadores de salida hacia servicios externos.
 * Añadir aquí nuevos módulos cuando se integren otros sistemas externos.
 */
@Module({
    imports: [ServiceNowOutboundModule, InventoryOutboundModule, IntegrationOutboundModule],
})
export class OutboundGatewayModule {}
