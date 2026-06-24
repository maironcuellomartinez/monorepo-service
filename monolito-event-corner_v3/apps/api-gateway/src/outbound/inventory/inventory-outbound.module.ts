// api-gateway/outbound/inventory/inventory-outbound.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InventoryOutboundController } from './inventory-outbound.controller';

@Module({
    imports: [HttpModule],
    controllers: [InventoryOutboundController],
})
export class InventoryOutboundModule {}
