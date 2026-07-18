import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  SnCompaniesService,
  CreateSnCompanyDto,
  UpdateSnCompanyDto,
} from './sn-companies.service';

@Controller('sn-companies')
export class SnCompaniesController {
  constructor(private readonly service: SnCompaniesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':sys_id')
  findOne(@Param('sys_id') sys_id: string) {
    return this.service.findBySysId(sys_id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSnCompanyDto) {
    return this.service.create(dto);
  }

  @Put(':sys_id')
  update(@Param('sys_id') sys_id: string, @Body() dto: UpdateSnCompanyDto) {
    return this.service.update(sys_id, dto);
  }

  @Delete(':sys_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('sys_id') sys_id: string) {
    return this.service.deactivate(sys_id);
  }
}
