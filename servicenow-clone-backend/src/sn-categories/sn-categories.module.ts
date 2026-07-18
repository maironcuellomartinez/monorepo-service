import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnCategoryEntity } from './sn-category.entity';
import { SnCategoriesService } from './sn-categories.service';
import { SnCategoriesController } from './sn-categories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SnCategoryEntity])],
  controllers: [SnCategoriesController],
  providers: [SnCategoriesService],
  exports: [SnCategoriesService],
})
export class SnCategoriesModule {}
