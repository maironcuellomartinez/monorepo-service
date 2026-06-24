import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1740000000000 implements MigrationInterface {
    name = 'InitialSchema1740000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`admins\` (
                \`id\`           int          NOT NULL AUTO_INCREMENT,
                \`username\`     varchar(100) NOT NULL,
                \`passwordHash\` varchar(128) NOT NULL,
                \`createdAt\`    datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedAt\`    datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY \`UQ_admins_username\` (\`username\`),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`external_clients\` (
                \`clientId\`            varchar(64)  NOT NULL,
                \`clientSecretHash\`    varchar(128) NOT NULL,
                \`name\`               varchar(100) NOT NULL,
                \`description\`        varchar(255) NULL,
                \`tokenExpiresInSeconds\` int        NOT NULL DEFAULT 3600,
                \`allowedScopes\`      text         NULL,
                \`isActive\`           tinyint      NOT NULL DEFAULT 1,
                \`createdAt\`          datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedAt\`          datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`clientId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
                \`id\`        int          NOT NULL AUTO_INCREMENT,
                \`clientId\`  varchar(64)  NOT NULL,
                \`tokenHash\` varchar(128) NOT NULL,
                \`expiresAt\` datetime     NOT NULL,
                \`revokedAt\` datetime     NULL,
                \`createdAt\` datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                INDEX \`IDX_refresh_tokens_clientId\` (\`clientId\`),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`refresh_tokens\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`external_clients\``);
        await queryRunner.query(`DROP TABLE IF EXISTS \`admins\``);
    }
}
