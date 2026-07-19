import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DynamicModule } from './dynamic-tables/dynamic.module';
import { ServicenowSimulatorModule } from './servicenow-simulator/servicenow-simulator.module';
import { SnCompaniesModule } from './sn-companies/sn-companies.module';
import { SnCategoriesModule } from './sn-categories/sn-categories.module';
import { SnGroupsModule } from './sn-groups/sn-groups.module';
import { SnLocationsModule } from './sn-locations/sn-locations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get('DB_PORT', 3306),
        username: config.get('DB_USERNAME', 'root'),
        password: config.get('DB_PASSWORD', 'root'),
        database: config.get('DB_NAME', 'servicenow_clone'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: false,
        // logging: config.get('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    DynamicModule,
    ServicenowSimulatorModule,
    SnCompaniesModule,
    SnCategoriesModule,
    SnGroupsModule,
    SnLocationsModule,
  ],
})
export class AppModule {}
