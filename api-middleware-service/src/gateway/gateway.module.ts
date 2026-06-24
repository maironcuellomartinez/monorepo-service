import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GatewayClient } from './gateway.client';

@Module({
    imports:  [HttpModule],
    providers: [GatewayClient],
    exports:   [GatewayClient],
})
export class GatewayModule {}
