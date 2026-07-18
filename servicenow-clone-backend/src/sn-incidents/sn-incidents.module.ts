import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnIncidentEntity } from './sn-incident.entity';
import { SnIncidentsService } from './sn-incidents.service';
import { SnIncidentsController } from './sn-incidents.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnIncidentEntity])],
  controllers: [SnIncidentsController],
  providers: [SnIncidentsService],
  exports: [SnIncidentsService],
})
export class SnIncidentsModule {}
