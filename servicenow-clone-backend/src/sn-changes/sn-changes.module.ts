import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnChangeEntity } from './sn-change.entity';
import { SnChangesService } from './sn-changes.service';
import { SnChangesController } from './sn-changes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnChangeEntity])],
  controllers: [SnChangesController],
  providers: [SnChangesService],
  exports: [SnChangesService],
})
export class SnChangesModule {}
