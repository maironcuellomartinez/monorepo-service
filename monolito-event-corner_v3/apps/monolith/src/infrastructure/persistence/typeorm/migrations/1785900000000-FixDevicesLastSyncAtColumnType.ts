import { MigrationInterface, QueryRunner } from 'typeorm';

// devices.last_sync_at era `timestamp` con default '1970-01-01 00:00:00' — el
// sentinel de "nunca sincronizado" (ver Device.create() en el dominio, que usa
// new Date(0)). timestamp no puede representar el epoch exacto (su rango
// válido arranca en 1970-01-01 00:00:01 UTC), lo que rompe con "Invalid
// default value for 'last_sync_at'" en MySQL con sql_mode estricto.
export class FixDevicesLastSyncAtColumnType1785900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE devices
            MODIFY COLUMN last_sync_at DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE devices
            MODIFY COLUMN last_sync_at TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'
        `);
  }
}
