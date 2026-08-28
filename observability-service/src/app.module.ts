import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { PersistenceModule } from './persistence/persistence.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { QueryModule } from './query/query.module';
import { HealthModule } from './health/health.module';
import { RetentionModule } from './retention/retention.module';
import { LogEntryEntity } from './persistence/entities/log-entry.entity';
import { TraceSpanEntity } from './persistence/entities/trace-span.entity';
import { MetricPointEntity } from './persistence/entities/metric-point.entity';

@Module({
    imports: [
        TypeOrmModule.forRoot({
            type: 'mysql',
            host: process.env.DB_HOST ?? 'localhost',
            port: parseInt(process.env.DB_PORT ?? '3306', 10),
            username: process.env.DB_USERNAME ?? 'root',
            password: process.env.DB_PASSWORD ?? '',
            database: process.env.DB_DATABASE ?? 'observability_db',
            entities: [LogEntryEntity, TraceSpanEntity, MetricPointEntity],
            synchronize: process.env.DB_SYNCHRONIZE === 'true',
            timezone: 'Z',
            // Sin esto, mysql2 usa su default y con replicas>1 el total de
            // conexiones contra la misma instancia MySQL queda sin acotar por
            // diseño — relevante acá porque este servicio recibe la mayor
            // tasa de escritura del ecosistema (logs+métricas+trazas de todos
            // los demás servicios).
            extra: { connectionLimit: 10 },
        }),
        ScheduleModule.forRoot(),
        AuthModule,
        PersistenceModule,
        IngestionModule,
        QueryModule,
        HealthModule,
        RetentionModule,
    ],
})
export class AppModule {}
