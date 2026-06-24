import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DynamicTablesController } from "./dynamic-tables.controller";
import { DynamicTablesService } from "./dynamic-tables.service";
import { DynamicTable } from "./dynamic-table.entity";
import { DynamicField } from "./dynamic-field.entity";

@Module({
    imports: [TypeOrmModule.forFeature([DynamicTable, DynamicField])],
    controllers: [DynamicTablesController],
    providers: [DynamicTablesService],
    exports: [DynamicTablesService],
})
export class DynamicModule {}