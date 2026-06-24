import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Logger,
} from '@nestjs/common';
import { ServicenowSimulatorService } from './servicenow-simulator.service';

const log = new Logger('SN-Clone');

@Controller('api/now/table')
export class ServicenowSimulatorTableController {
  constructor(private readonly service: ServicenowSimulatorService) {}

  @Post(':tableName')
  async create(
    @Param('tableName') tableName: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.service.create(tableName, body);
    log.log(`POST /api/now/table/${tableName} → ${result.number} (${result.sys_id})`);
    return { result };
  }

  @Get(':tableName')
  async findAll(@Param('tableName') tableName: string) {
    const records = await this.service.findAll(tableName);
    log.log(`GET /api/now/table/${tableName} → ${records.length} registro(s)`);
    return { result: records };
  }

  @Get(':tableName/:sys_id')
  async findOne(
    @Param('tableName') tableName: string,
    @Param('sys_id') sys_id: string,
  ) {
    const record = await this.service.findOne(tableName, sys_id);
    log.log(`GET /api/now/table/${tableName}/${sys_id} → ${record.number}`);
    return { result: record };
  }

  @Patch(':tableName/:sys_id')
  async update(
    @Param('tableName') tableName: string,
    @Param('sys_id') sys_id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.service.update(tableName, sys_id, body);
    log.log(`PATCH /api/now/table/${tableName}/${sys_id} → ${result.number} state=${result.state}`);
    return { result };
  }
}
