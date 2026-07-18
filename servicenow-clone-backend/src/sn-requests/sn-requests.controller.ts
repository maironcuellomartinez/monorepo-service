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
import { SnRequestsService } from './sn-requests.service';

@Controller('sn-requests')
export class SnRequestsController {
  constructor(private readonly service: SnRequestsService) {}

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
