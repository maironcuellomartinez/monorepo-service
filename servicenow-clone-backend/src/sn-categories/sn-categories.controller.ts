import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import {
  SnCategoriesService,
  CreateCategoryDto,
} from './sn-categories.service';

@Controller('sn-categories')
export class SnCategoriesController implements OnModuleInit {
  constructor(private readonly service: SnCategoriesService) {}

  async onModuleInit() {
    await this.service.seedDefaults();
  }

  /** Árbol jerárquico (categorías + subcategorías anidadas) */
  @Get('tree')
  getTree(@Query('table') table?: string) {
    return this.service.getTree(table);
  }

  /** Lista plana — para pickers de categoría de cierre */
  @Get('close')
  getCloseCategories(@Query('table') table?: string) {
    return this.service.findFlat(table ?? 'incident', 'close_category');
  }

  /** Lista plana filtrable */
  @Get()
  findAll(@Query('table') table?: string, @Query('type') type?: string) {
    return this.service.findFlat(table, type);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateCategoryDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}
