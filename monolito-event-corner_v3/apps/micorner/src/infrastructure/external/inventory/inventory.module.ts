// infrastructure/external/inventory/inventory.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { InventoryHttpAdapter } from './inventory-http.adapter';
import { EXTERNAL_INVENTORY_SERVICE } from '../../../core/ports/outgoing/infrastructure-tokens';

@Module({
    imports: [
        HttpModule.register({ timeout: 15000, maxRedirects: 3 }),
        ConfigModule,
    ],
    providers: [
        {
            provide: EXTERNAL_INVENTORY_SERVICE,
            useClass: InventoryHttpAdapter,
        },
    ],
    exports: [EXTERNAL_INVENTORY_SERVICE],
})
export class InventoryModule { }
