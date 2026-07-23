import { MigrationInterface, QueryRunner } from 'typeorm';

// Agrega los atributos de clasificación de ServiceNow al catálogo de tipos de
// incidencia (issue_types): urgency/impact (1–3) y severity (u_severity en SN).
// Hasta ahora el api-gateway hardcodeaba estos valores (2/2/'medium') al armar
// el payload hacia api-snowq-service; ahora cada IssueType puede definirlos.
// Los defaults replican el comportamiento previo, así que las filas existentes
// y el flujo actual no cambian hasta que un admin configure un tipo.
//
// Idempotente: en dev synchronize=true ya crea las columnas desde la entity
// antes de correr las migraciones, así que cada ADD/DROP se hace solo si
// corresponde (evita "Duplicate column name" que tumbaba el arranque).
export class AddSnClassificationToIssueTypes1784600000000 implements MigrationInterface {
  private async columnExists(
    queryRunner: QueryRunner,
    column: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'issue_types'
          AND column_name = ?`,
      [column],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<[string, string]> = [
      ['sn_urgency', 'INT NOT NULL DEFAULT 2'],
      ['sn_impact', 'INT NOT NULL DEFAULT 2'],
      ['sn_severity', "VARCHAR(20) NOT NULL DEFAULT 'medium'"],
    ];
    for (const [name, definition] of columns) {
      if (!(await this.columnExists(queryRunner, name))) {
        await queryRunner.query(
          `ALTER TABLE issue_types ADD COLUMN ${name} ${definition}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['sn_severity', 'sn_impact', 'sn_urgency']) {
      if (await this.columnExists(queryRunner, name)) {
        await queryRunner.query(`ALTER TABLE issue_types DROP COLUMN ${name}`);
      }
    }
  }
}
