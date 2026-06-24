import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DynamicTable } from './dynamic-table.entity';
import { DynamicField } from './dynamic-field.entity';
import { CreateTableDto, UpdateTableDto } from './dto';

// Reserved SQL keywords that should not be used as table/field names
const RESERVED_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
    'ALTER', 'TABLE', 'INDEX', 'KEY', 'PRIMARY', 'FOREIGN', 'REFERENCES',
    'NULL', 'NOT', 'AND', 'OR', 'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY', 'GROUP',
    'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'UNION', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'AS', 'ON',
    'INTO', 'VALUES', 'SET', 'DATABASE', 'USER', 'PASSWORD', 'GRANT', 'REVOKE',
];

@Injectable()
export class DynamicTablesService {
    constructor(
        @InjectRepository(DynamicTable)
        private tableRepository: Repository<DynamicTable>,
        @InjectRepository(DynamicField)
        private fieldRepository: Repository<DynamicField>,
        private dataSource: DataSource,
    ) { }

    /**
     * Validates that a name is a safe SQL identifier (prevents SQL injection)
     */
    private isValidIdentifier(name: string): boolean {
        // Must start with lowercase letter, contain only lowercase letters, numbers, and underscores
        // Max length 50 characters
        if (!name || name.length > 50) return false;
        if (!/^[a-z][a-z0-9_]*$/.test(name)) return false;
        // Cannot be a reserved keyword
        if (RESERVED_KEYWORDS.includes(name.toUpperCase())) return false;
        return true;
    }

    /**
     * Maps field types to MySQL column types
     */
    private getColumnType(type: string): string {
        const typeMap: Record<string, string> = {
            'string': 'VARCHAR(255)',
            'number': 'INT',
            'boolean': 'TINYINT(1)',
            'text': 'TEXT',
            'datetime': 'DATETIME',
            'reference': 'VARCHAR(36)',
            'email': 'VARCHAR(255)',
            'url': 'VARCHAR(500)',
            'json': 'JSON',
            'decimal': 'DECIMAL(19,4)',
        };
        return typeMap[type] || 'VARCHAR(255)';
    }

    async findAll(): Promise<DynamicTable[]> {
        return this.tableRepository.find({ relations: ['fields'] });
    }

    async findOne(id: string): Promise<DynamicTable> {
        const table = await this.tableRepository.findOne({
            where: { id },
            relations: ['fields'],
        });
        if (!table) {
            throw new NotFoundException(`Table with ID ${id} not found`);
        }
        return table;
    }

    async findByName(name: string): Promise<DynamicTable | null> {
        return this.tableRepository.findOne({
            where: { name },
            relations: ['fields'],
        });
    }

    async createTable(createTableDto: CreateTableDto) {
        // Validate table name
        if (!this.isValidIdentifier(createTableDto.name)) {
            throw new BadRequestException(
                `Invalid table name: "${createTableDto.name}". Must start with lowercase letter, contain only lowercase letters, numbers, and underscores, and not be a reserved keyword.`
            );
        }

        // Check if table name already exists
        const existingTable = await this.findByName(createTableDto.name);
        if (existingTable) {
            throw new ConflictException(`Table with name "${createTableDto.name}" already exists`);
        }

        // Validate all field names
        for (const field of createTableDto.fields) {
            if (!this.isValidIdentifier(field.name)) {
                throw new BadRequestException(
                    `Invalid field name: "${field.name}". Must start with lowercase letter, contain only lowercase letters, numbers, and underscores, and not be a reserved keyword.`
                );
            }
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Save the table definition
            const table = queryRunner.manager.create(DynamicTable, {
                name: createTableDto.name,
                label: createTableDto.label,
                description: createTableDto.description || '',
            });
            const savedTable = await queryRunner.manager.save(table);

            // Save the fields
            const savedFields = await Promise.all(
                createTableDto.fields.map(field => {
                    const fieldEntity = queryRunner.manager.create(DynamicField, {
                        ...field,
                        table: savedTable,
                    });
                    return queryRunner.manager.save(fieldEntity);
                })
            );

            // Create the physical table in the database
            await this.createPhysicalTable(queryRunner, savedTable.name, savedFields);

            await queryRunner.commitTransaction();
            return { table: savedTable, fields: savedFields };
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async updateTable(id: string, updateTableDto: UpdateTableDto) {

        if (updateTableDto.fields) {
            // Validate all field names
            for (const field of updateTableDto.fields) {
                if (!this.isValidIdentifier(field.name)) {
                    throw new BadRequestException(
                        `Invalid field name: "${field.name}". Must start with lowercase letter, contain only lowercase letters, numbers, and underscores, and not be a reserved keyword.`
                    );
                }
            }
        }

        // Only allow updating metadata (label, description)
        // Updating table name or field structure requires more complex logic
        const updateData: Partial<DynamicTable> = {};
        if (updateTableDto.label !== undefined) {
            updateData.label = updateTableDto.label;
        }
        if (updateTableDto.description !== undefined) {
            updateData.description = updateTableDto.description;
        }

        await this.tableRepository.update(id, updateData);
        return this.findOne(id);
    }

    async deleteTable(id: string) {
        const table = await this.findOne(id);

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Drop the physical table
            await queryRunner.query(`DROP TABLE IF EXISTS \`${table.name}\``);

            // Delete the metadata records (cascade should handle fields)
            await queryRunner.manager.remove(table);

            await queryRunner.commitTransaction();
            return { message: `Table "${table.name}" deleted successfully` };
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Creates a physical table in the database
     * @param queryRunner Query runner instance
     * @param tableName Table name
     * @param fields Fields to create
     * @description This method creates a physical table in the database with the given fields and metadata
     * @throws Error if table creation fails
     */
    private async createPhysicalTable(queryRunner: QueryRunner, tableName: string, fields: DynamicField[]) {
        const columns = fields.map(field => {
            const columnType = this.getColumnType(field.type);
            return `\`${field.name}\` ${columnType} ${field.mandatory ? 'NOT NULL' : 'NULL'}`;
        }).join(',\n        ');

        await queryRunner.query(`
            CREATE TABLE \`${tableName}\` (
                \`id\` VARCHAR(36) NOT NULL PRIMARY KEY,
                \`createdAt\` DATETIME NOT NULL,
                \`updatedAt\` DATETIME NOT NULL,
                \`createdBy\` VARCHAR(255) NULL,
                \`updatedBy\` VARCHAR(255) NULL,
                ${columns}
            )
        `);
    }
}