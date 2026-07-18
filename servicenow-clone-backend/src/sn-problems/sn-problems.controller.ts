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
import { SnProblemsService } from './sn-problems.service';

@Controller('sn-problems')
export class SnProblemsController {
  constructor(private readonly service: SnProblemsService) {}

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
