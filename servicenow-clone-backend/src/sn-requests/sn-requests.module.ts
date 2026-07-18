import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnRequestEntity } from './sn-request.entity';
import { SnRequestsService } from './sn-requests.service';
import { SnRequestsController } from './sn-requests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnRequestEntity])],
  controllers: [SnRequestsController],
  providers: [SnRequestsService],
  exports: [SnRequestsService],
})
export class SnRequestsModule {}
