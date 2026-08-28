import { MigrationInterface, QueryRunner } from 'typeorm';

// Las compañías ahora se crean únicamente vía sync desde ServiceNow
// (SnCompanySyncJob / POST /internal/companies/sync-from-sn) y entran sin
// árbol de tipos de cita asignado — el admin lo asigna después desde el
// dashboard. tree_id deja de ser obligatorio a nivel de esquema.
export class MakeCompaniesTreeIdNullable1785800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE companies
            MODIFY COLUMN tree_id VARCHAR(50) NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE companies
            MODIFY COLUMN tree_id VARCHAR(50) NOT NULL
        `);
  }
}
