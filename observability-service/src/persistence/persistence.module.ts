import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogEntryEntity } from './entities/log-entry.entity';
import { TraceSpanEntity } from './entities/trace-span.entity';
import { MetricPointEntity } from './entities/metric-point.entity';

@Module({
    imports: [TypeOrmModule.forFeature([LogEntryEntity, TraceSpanEntity, MetricPointEntity])],
    exports: [TypeOrmModule],
})
export class PersistenceModule {}
