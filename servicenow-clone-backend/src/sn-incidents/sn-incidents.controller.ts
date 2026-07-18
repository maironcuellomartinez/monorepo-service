import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SnIncidentsService } from './sn-incidents.service';

@Controller('sn-incidents')
export class SnIncidentsController {
  constructor(private readonly service: SnIncidentsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':sys_id')
  findOne(@Param('sys_id') sys_id: string) {
    return this.service.findOne(sys_id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Patch(':sys_id')
  update(
    @Param('sys_id') sys_id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.update(sys_id, body);
  }
}
