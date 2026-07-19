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
  SnLocationsService,
  CreateSnLocationDto,
  UpdateSnLocationDto,
} from './sn-locations.service';

@Controller('sn-locations')
export class SnLocationsController {
  constructor(private readonly service: SnLocationsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.service.findAll(all !== 'true');
  }

  @Get(':sys_id')
  findOne(@Param('sys_id') sys_id: string) {
    return this.service.findBySysId(sys_id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSnLocationDto) {
    return this.service.create(dto);
  }

  @Put(':sys_id')
  update(@Param('sys_id') sys_id: string, @Body() dto: UpdateSnLocationDto) {
    return this.service.update(sys_id, dto);
  }

  @Delete(':sys_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('sys_id') sys_id: string) {
    return this.service.deactivate(sys_id);
  }
}
