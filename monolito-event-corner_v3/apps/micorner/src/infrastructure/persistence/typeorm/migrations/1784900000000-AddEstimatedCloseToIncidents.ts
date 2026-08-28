import { MigrationInterface, QueryRunner } from 'typeorm';

// Agrega Incident.estimatedCloseAt: fecha estimada de cierre, editable
// libremente por el técnico asignado (paridad con legacy) — independiente
// del slot reservado. Nullable: nada la backfillea; se completa a partir de
// scheduledRange.start + IssueType.closeMinutes en el próximo save() o
// queda vacía para incidencias existentes hasta que el técnico la edite.
//
// Idempotente: en dev synchronize=true ya crea la columna desde la entity
// antes de correr las migraciones (mismo patrón que AddCodeToCorners).
export class AddEstimatedCloseToIncidents1784900000000
  implements MigrationInterface
{
  private async columnExists(
    queryRunner: QueryRunner,
    column: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'incidents'
          AND column_name = ?`,
      [column],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.columnExists(queryRunner, 'estimated_close_at'))) {
      await queryRunner.query(
        `ALTER TABLE incidents ADD COLUMN estimated_close_at TIMESTAMP NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.columnExists(queryRunner, 'estimated_close_at')) {
      await queryRunner.query(
        `ALTER TABLE incidents DROP COLUMN estimated_close_at`,
      );
    }
  }
}
