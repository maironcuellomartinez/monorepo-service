import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ResilienceController } from 'src/resilience/resilience.controller';

@Module({
    imports: [TypeOrmModule],
    controllers: [HealthController, ResilienceController],
    providers: [HealthService],
})
export class HealthModule {}
