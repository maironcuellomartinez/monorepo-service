import {
    Controller,
    Post,
    Get,
    Put,
    Delete,
    Body,
    Param,
    ParseUUIDPipe,
} from '@nestjs/common';
import { DynamicTablesService } from './dynamic-tables.service';
import { CreateTableDto, UpdateTableDto } from './dto';

@Controller('dynamic-tables')
export class DynamicTablesController {
    constructor(private readonly dynamicTablesService: DynamicTablesService) { }

    @Post()
    async createTable(@Body() createTableDto: CreateTableDto) {
        return this.dynamicTablesService.createTable(createTableDto);
    }

    @Get()
    async findAll() {
        return this.dynamicTablesService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.dynamicTablesService.findOne(id);
    }

    @Put(':id')
    async updateTable(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateTableDto: UpdateTableDto,
    ) {
        return this.dynamicTablesService.updateTable(id, updateTableDto);
    }

    @Delete(':id')
    async deleteTable(@Param('id', ParseUUIDPipe) id: string) {
        return this.dynamicTablesService.deleteTable(id);
    }
}