import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { GatewayModule } from '../../gateway/gateway.module';
import { BulkheadModule } from '@backendkit-labs/bulkhead/nestjs';

@Module({
    imports: [TerminusModule, HttpModule, GatewayModule, BulkheadModule],
    controllers: [HealthController],
    providers: [HealthService],
})
export class HealthModule { }
