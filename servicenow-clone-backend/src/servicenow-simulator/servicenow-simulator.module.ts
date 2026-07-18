import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicenowSimulatorController } from './servicenow-simulator.controller';
import { ServicenowSimulatorTableController } from './servicenow-simulator-table.controller';
import { ServicenowSimulatorService } from './servicenow-simulator.service';
import { SnowTicketEntity } from './snow-ticket.entity';
import { SnIncidentsModule } from '../sn-incidents/sn-incidents.module';
import { SnRequestsModule } from '../sn-requests/sn-requests.module';
import { SnTasksModule } from '../sn-tasks/sn-tasks.module';
import { SnChangesModule } from '../sn-changes/sn-changes.module';
import { SnProblemsModule } from '../sn-problems/sn-problems.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SnowTicketEntity]),
    SnIncidentsModule,
    SnRequestsModule,
    SnTasksModule,
    SnChangesModule,
    SnProblemsModule,
  ],
  controllers: [
    ServicenowSimulatorController,
    ServicenowSimulatorTableController,
  ],
  providers: [ServicenowSimulatorService],
})
export class ServicenowSimulatorModule {}
