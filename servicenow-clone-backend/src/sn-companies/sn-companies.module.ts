import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnCompanyEntity } from './sn-company.entity';
import { SnCompaniesService } from './sn-companies.service';
import { SnCompaniesController } from './sn-companies.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnCompanyEntity])],
  controllers: [SnCompaniesController],
  providers: [SnCompaniesService],
  exports: [SnCompaniesService],
})
export class SnCompaniesModule {}
