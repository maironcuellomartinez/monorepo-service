import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJtiHashToRefreshTokens1745000000000 implements MigrationInterface {
    name = 'AddJtiHashToRefreshTokens1745000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const [columns] = await queryRunner.query(`
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'refresh_tokens'
              AND COLUMN_NAME  = 'jtiHash'
        `);
        if (Number(columns.cnt) === 0) {
            await queryRunner.query(
                `ALTER TABLE \`refresh_tokens\` ADD \`jtiHash\` varchar(64) NULL`,
            );
        }

        const [indexes] = await queryRunner.query(`
            SELECT COUNT(*) AS cnt
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'refresh_tokens'
              AND INDEX_NAME   = 'IDX_refresh_tokens_jtiHash'
        `);
        if (Number(indexes.cnt) === 0) {
            await queryRunner.query(
                `CREATE INDEX \`IDX_refresh_tokens_jtiHash\` ON \`refresh_tokens\` (\`jtiHash\`)`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX \`IDX_refresh_tokens_jtiHash\` ON \`refresh_tokens\``,
        );
        await queryRunner.query(
            `ALTER TABLE \`refresh_tokens\` DROP COLUMN \`jtiHash\``,
        );
    }
}
