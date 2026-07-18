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
} from '@nestjs/common';
import {
  SnGroupsService,
  CreateSnGroupDto,
  UpdateSnGroupDto,
} from './sn-groups.service';

@Controller('sn-groups')
export class SnGroupsController {
  constructor(private readonly service: SnGroupsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.service.findAll(all !== 'true');
  }

  @Get(':sys_id')
  findOne(@Param('sys_id') sys_id: string) {
    return this.service.findBySysId(sys_id);
  }

  @Get(':sys_id/exists')
  async exists(@Param('sys_id') sys_id: string) {
    return { sys_id, exists: await this.service.exists(sys_id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSnGroupDto) {
    return this.service.create(dto);
  }

  @Put(':sys_id')
  update(@Param('sys_id') sys_id: string, @Body() dto: UpdateSnGroupDto) {
    return this.service.update(sys_id, dto);
  }

  @Delete(':sys_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('sys_id') sys_id: string) {
    return this.service.deactivate(sys_id);
  }
}
