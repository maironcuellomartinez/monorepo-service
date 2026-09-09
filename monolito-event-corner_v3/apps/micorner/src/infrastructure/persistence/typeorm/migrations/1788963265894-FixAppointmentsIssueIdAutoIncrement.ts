import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convierte `appointments.issue_id` a AUTO_INCREMENT nativo (reemplaza el
 * contador manual de `issue_sequences`, eliminado en esta misma serie de
 * cambios). Necesaria como migración separada — no alcanza con editar
 * `InitialSchema1788194786468` — porque esa migración ya corrió (o el
 * schema equivalente ya existe vía `synchronize`) en cualquier ambiente
 * con datos reales: TypeORM no re-ejecuta una migración ya registrada en
 * su tabla `migrations`, así que el `CREATE TABLE` editado solo beneficia
 * instalaciones nuevas.
 *
 * MySQL exige que una columna AUTO_INCREMENT ya sea parte de una key en la
 * MISMA sentencia que la agrega/modifica (`ER_WRONG_AUTO_KEY` si no) —
 * verificado en vivo que `synchronize` no lo garantiza (separa el ADD/MODIFY
 * COLUMN del ADD INDEX en dos ALTER). Por eso esta migración combina
 * columna + índice en un único ALTER, sea cual sea el estado de partida:
 *   - `issue_id` no existe todavía → ADD COLUMN + ADD INDEX.
 *   - `issue_id` existe pero es un int plano (con datos) → MODIFY COLUMN +
 *     ADD INDEX. MySQL preserva los valores existentes y arranca el
 *     contador en MAX(issue_id)+1 automáticamente.
 *   - `issue_id` ya es AUTO_INCREMENT (instalación nueva vía
 *     InitialSchema1788194786468 ya actualizada) → no-op.
 */
export class FixAppointmentsIssueIdAutoIncrement1788963265894
  implements MigrationInterface
{
  name = 'FixAppointmentsIssueIdAutoIncrement1788963265894';

  private static readonly INDEX_NAME = 'IDX_appointments_issue_id';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ EXTRA: string | null }> = await queryRunner.query(
      `SELECT EXTRA FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'issue_id'`,
    );

    if (columns.length > 0 && /auto_increment/i.test(columns[0].EXTRA ?? '')) {
      return; // instalación nueva: InitialSchema1788194786468 ya lo creó bien
    }

    const existingIndexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'issue_id'`,
    );
    for (const row of existingIndexes) {
      // Con la columna todavía sin AUTO_INCREMENT, borrar cualquier índice
      // previo (de un intento fallido con otro nombre) es seguro.
      await queryRunner.query(
        `ALTER TABLE \`appointments\` DROP INDEX \`${row.INDEX_NAME}\``,
      );
    }

    const columnClause =
      columns.length === 0
        ? 'ADD COLUMN `issue_id` INT UNSIGNED NOT NULL AUTO_INCREMENT'
        : 'MODIFY COLUMN `issue_id` INT UNSIGNED NOT NULL AUTO_INCREMENT';

    await queryRunner.query(
      `ALTER TABLE \`appointments\` ${columnClause}, ADD UNIQUE INDEX \`${FixAppointmentsIssueIdAutoIncrement1788963265894.INDEX_NAME}\` (\`issue_id\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`appointments\` DROP INDEX \`${FixAppointmentsIssueIdAutoIncrement1788963265894.INDEX_NAME}\`, MODIFY COLUMN \`issue_id\` INT UNSIGNED NOT NULL`,
    );
  }
}
