import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnProblemEntity } from './sn-problem.entity';
import { SnProblemsService } from './sn-problems.service';
import { SnProblemsController } from './sn-problems.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnProblemEntity])],
  controllers: [SnProblemsController],
  providers: [SnProblemsService],
  exports: [SnProblemsService],
})
export class SnProblemsModule {}
