import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicenowSimulatorController } from './servicenow-simulator.controller';
import { ServicenowSimulatorTableController } from './servicenow-simulator-table.controller';
import { ServicenowSimulatorService } from './servicenow-simulator.service';
import { SnowTicketEntity } from './snow-ticket.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SnowTicketEntity])],
  controllers: [ServicenowSimulatorController, ServicenowSimulatorTableController],
  providers: [ServicenowSimulatorService],
})
export class ServicenowSimulatorModule { }
