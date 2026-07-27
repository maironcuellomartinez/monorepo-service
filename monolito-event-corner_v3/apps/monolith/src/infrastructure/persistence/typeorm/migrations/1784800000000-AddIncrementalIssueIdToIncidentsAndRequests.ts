import { MigrationInterface, QueryRunner } from 'typeorm';

// Agrega Incident.issueId / Request.issueId: un correlativo incremental
// (secuencia independiente por tabla) usado como referencia externa estable
// hacia ServiceNow — análogo al id numérico corto del sistema legacy (ej.
// u_external_system_id = '1526_local_abelias'). Reemplaza el UUID interno
// (Incident.id / Request.id) en ServiceNowIntegrationService.buildExternalId,
// que hasta ahora usaba el UUID completo por no existir un correlativo corto
// en el nuevo sistema.
//
// issue_id es una columna INT normal, NO AUTO_INCREMENT: se probó esa ruta
// (@Generated('increment') + synchronize) y TypeORM reescribe el índice
// único de esas columnas en cada comparación de esquema — en MySQL eso choca
// con "an auto_increment column must be a key" y tira ER_WRONG_AUTO_KEY en
// cada restart de dev. En su lugar, el valor se asigna en aplicación
// (TypeOrmIncidentRepository/TypeOrmRequestRepository.allocateIssueId) contra
// una tabla de secuencias (issue_sequences), usando el truco atómico
// UPDATE ... SET next_value = LAST_INSERT_ID(next_value + 1) de MySQL.
//
// Backfill: las filas existentes reciben un correlativo secuencial ordenado
// por created_at (vía variable de sesión @rownum), y la secuencia de cada
// tabla arranca en MAX(issue_id) + 1 para no colisionar con lo backfillado.
//
// Idempotente: en dev synchronize=true ya crea la columna `issue_id` desde
// la entity (plain @Column) antes de correr las migraciones — mismo patrón
// que AddCodeToCorners. El backfill y la tabla de secuencias sí son
// exclusivos de esta migración (synchronize no los toca).
export class AddIncrementalIssueIdToIncidentsAndRequests1784800000000
  implements MigrationInterface
{
  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?`,
      [table, column],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  private async tableExists(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  /** Agrega issue_id (si falta) y backfillea filas existentes ordenadas por created_at. */
  private async ensureIssueIdColumn(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    if (!(await this.columnExists(queryRunner, table, 'issue_id'))) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN issue_id INT UNSIGNED NULL`,
      );
      await queryRunner.query(`SET @rownum := 0`);
      await queryRunner.query(
        `UPDATE ${table} SET issue_id = (@rownum := @rownum + 1) ORDER BY created_at ASC`,
      );
      await queryRunner.query(
        `ALTER TABLE ${table} MODIFY COLUMN issue_id INT UNSIGNED NOT NULL`,
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureIssueIdColumn(queryRunner, 'incidents');
    await this.ensureIssueIdColumn(queryRunner, 'requests');

    if (!(await this.tableExists(queryRunner, 'issue_sequences'))) {
      await queryRunner.query(`
        CREATE TABLE issue_sequences (
          entity_name VARCHAR(20) NOT NULL PRIMARY KEY,
          next_value INT UNSIGNED NOT NULL DEFAULT 1
        ) ENGINE=InnoDB
      `);
    }

    const [incMax]: Array<{ maxId: number | null }> = await queryRunner.query(
      `SELECT MAX(issue_id) AS maxId FROM incidents`,
    );
    const [reqMax]: Array<{ maxId: number | null }> = await queryRunner.query(
      `SELECT MAX(issue_id) AS maxId FROM requests`,
    );

    await queryRunner.query(
      `INSERT INTO issue_sequences (entity_name, next_value) VALUES ('incident', ?)
         ON DUPLICATE KEY UPDATE next_value = GREATEST(next_value, VALUES(next_value))`,
      [Number(incMax.maxId ?? 0) + 1],
    );
    await queryRunner.query(
      `INSERT INTO issue_sequences (entity_name, next_value) VALUES ('request', ?)
         ON DUPLICATE KEY UPDATE next_value = GREATEST(next_value, VALUES(next_value))`,
      [Number(reqMax.maxId ?? 0) + 1],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'issue_sequences')) {
      await queryRunner.query(`DROP TABLE issue_sequences`);
    }
    if (await this.columnExists(queryRunner, 'requests', 'issue_id')) {
      await queryRunner.query(`ALTER TABLE requests DROP COLUMN issue_id`);
    }
    if (await this.columnExists(queryRunner, 'incidents', 'issue_id')) {
      await queryRunner.query(`ALTER TABLE incidents DROP COLUMN issue_id`);
    }
  }
}
