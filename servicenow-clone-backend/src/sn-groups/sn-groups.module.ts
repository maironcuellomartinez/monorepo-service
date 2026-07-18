import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnGroupEntity } from './sn-group.entity';
import { SnGroupsService } from './sn-groups.service';
import { SnGroupsController } from './sn-groups.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnGroupEntity])],
  controllers: [SnGroupsController],
  providers: [SnGroupsService],
  exports: [SnGroupsService],
})
export class SnGroupsModule {}
