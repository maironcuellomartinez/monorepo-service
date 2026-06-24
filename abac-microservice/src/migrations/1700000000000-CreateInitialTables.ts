import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateInitialTables1700000000000 implements MigrationInterface {
    name = 'CreateInitialTables1700000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Tabla de Aplicaciones
        await queryRunner.createTable(new Table({
            name: 'application',
            columns: [
                {
                    name: 'id',
                    type: 'varchar',
                    length: '36',
                    isPrimary: true,
                },
                {
                    name: 'name',
                    type: 'varchar',
                    length: '255',
                    isNullable: false,
                },
                {
                    name: 'description',
                    type: 'text',
                    isNullable: true,
                },
                {
                    name: 'api_key',
                    type: 'varchar',
                    length: '255',
                    isNullable: false,
                    isUnique: true,
                },
                {
                    name: 'is_active',
                    type: 'boolean',
                    default: true,
                },
                {
                    name: 'created_at',
                    type: 'timestamp',
                    default: 'CURRENT_TIMESTAMP',
                },
                {
                    name: 'updated_at',
                    type: 'timestamp',
                    default: 'CURRENT_TIMESTAMP',
                    onUpdate: 'CURRENT_TIMESTAMP',
                },
            ],
        }), true);

        // Tabla de Políticas
        await queryRunner.createTable(new Table({
            name: 'policy',
            columns: [
                {
                    name: 'id',
                    type: 'varchar',
                    length: '36',
                    isPrimary: true,
                },
                {
                    name: 'app_id',
                    type: 'varchar',
                    length: '36',
                    isNullable: false,
                },
                {
                    name: 'name',
                    type: 'varchar',
                    length: '255',
                    isNullable: false,
                },
                {
                    name: 'effect',
                    type: 'enum',
                    enum: ['allow', 'deny'],
                    default: "'allow'",
                },
                {
                    name: 'sub_rule',
                    type: 'json',
                    isNullable: false,
                },
                {
                    name: 'obj_rule',
                    type: 'json',
                    isNullable: false,
                },
                {
                    name: 'action',
                    type: 'varchar',
                    length: '100',
                    isNullable: false,
                },
                {
                    name: 'priority',
                    type: 'int',
                    default: 0,
                },
                {
                    name: 'enabled',
                    type: 'boolean',
                    default: true,
                },
                {
                    name: 'description',
                    type: 'text',
                    isNullable: true,
                },
                {
                    name: 'created_at',
                    type: 'timestamp',
                    default: 'CURRENT_TIMESTAMP',
                },
                {
                    name: 'updated_at',
                    type: 'timestamp',
                    default: 'CURRENT_TIMESTAMP',
                    onUpdate: 'CURRENT_TIMESTAMP',
                },
            ],
        }), true);

        // Foreign Key
        await queryRunner.createForeignKey('policy', new TableForeignKey({
            columnNames: ['app_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'application',
            onDelete: 'CASCADE',
        }));

        // Índices
        await queryRunner.createIndex('policy', new TableIndex({
            name: 'IDX_POLICY_APP_ACTION',
            columnNames: ['app_id', 'action'],
        }));

        await queryRunner.createIndex('policy', new TableIndex({
            name: 'IDX_POLICY_PRIORITY',
            columnNames: ['priority'],
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar índices primero
        await queryRunner.dropIndex('policy', 'IDX_POLICY_PRIORITY');
        await queryRunner.dropIndex('policy', 'IDX_POLICY_APP_ACTION');

        // Eliminar foreign keys
        const policyTable = await queryRunner.getTable('policy');
        const foreignKey = policyTable?.foreignKeys.find(
            fk => fk.columnNames.indexOf('app_id') !== -1,
        );

        if (foreignKey) {
            await queryRunner.dropForeignKey('policy', foreignKey);
        }

        // Eliminar tablas
        await queryRunner.dropTable('policy');
        await queryRunner.dropTable('application');
    }
}