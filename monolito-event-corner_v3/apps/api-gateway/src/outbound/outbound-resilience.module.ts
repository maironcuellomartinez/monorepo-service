import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboundResilienceService } from './outbound-resilience.service';

@Module({
    imports: [ConfigModule],
    providers: [OutboundResilienceService],
    exports: [OutboundResilienceService],
})
export class OutboundResilienceModule {}
