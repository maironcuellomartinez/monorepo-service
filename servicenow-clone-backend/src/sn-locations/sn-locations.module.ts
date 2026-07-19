import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnLocationEntity } from './sn-location.entity';
import { SnLocationsService } from './sn-locations.service';
import { SnLocationsController } from './sn-locations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnLocationEntity])],
  controllers: [SnLocationsController],
  providers: [SnLocationsService],
  exports: [SnLocationsService],
})
export class SnLocationsModule {}
