import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnTaskEntity } from './sn-task.entity';
import { SnTasksService } from './sn-tasks.service';
import { SnTasksController } from './sn-tasks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnTaskEntity])],
  controllers: [SnTasksController],
  providers: [SnTasksService],
  exports: [SnTasksService],
})
export class SnTasksModule {}
