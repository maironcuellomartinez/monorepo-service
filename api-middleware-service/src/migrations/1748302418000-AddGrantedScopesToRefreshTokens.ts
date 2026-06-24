import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGrantedScopesToRefreshTokens1748302418000 implements MigrationInterface {
    name = 'AddGrantedScopesToRefreshTokens1748302418000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE \`refresh_tokens\` ADD \`grantedScopes\` text NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE \`refresh_tokens\` DROP COLUMN \`grantedScopes\``,
        );
    }
}
