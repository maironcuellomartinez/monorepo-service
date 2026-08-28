import { MigrationInterface, QueryRunner } from 'typeorm';

// Agrega Corner.code: identificador técnico estable (slug) usado como
// referencia externa (p.ej. ServiceNow u_external_system_id), separado del
// name porque el name es texto de display que un admin puede renombrar sin
// que eso deba romper las referencias externas ya emitidas.
//
// Backfill: las filas existentes reciben un slug derivado del name (con
// sufijo del corner_id si hay colisión). Es un placeholder — si el legacy
// tenía códigos reales (p.ej. 'local_abelias') hay que corregirlos a mano
// vía PUT /internal/corners/:id { code } una vez migrados los datos reales.
//
// Idempotente: en dev synchronize=true ya crea la columna desde la entity
// antes de correr las migraciones (mismo patrón que AddSnClassificationToIssueTypes).
export class AddCodeToCorners1784700000000 implements MigrationInterface {
  private static readonly ACCENT_MAP: Record<string, string> = {
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  };

  private slugify(name: string): string {
    const noAccents = name
      .toLowerCase()
      .split('')
      .map((ch) => AddCodeToCorners1784700000000.ACCENT_MAP[ch] ?? ch)
      .join('');
    return noAccents.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  private async columnExists(
    queryRunner: QueryRunner,
    column: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'corners'
          AND column_name = ?`,
      [column],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  private async indexExists(
    queryRunner: QueryRunner,
    index: string,
  ): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'corners'
          AND index_name = ?`,
      [index],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.columnExists(queryRunner, 'code'))) {
      await queryRunner.query(
        `ALTER TABLE corners ADD COLUMN code VARCHAR(50) NULL`,
      );
    }

    const pending: Array<{ corner_id: string; name: string }> =
      await queryRunner.query(
        `SELECT corner_id, name FROM corners WHERE code IS NULL`,
      );

    if (pending.length > 0) {
      const existingRows: Array<{ code: string }> = await queryRunner.query(
        `SELECT code FROM corners WHERE code IS NOT NULL`,
      );
      const used = new Set(existingRows.map((r) => r.code));

      for (const row of pending) {
        let candidate = this.slugify(row.name) || 'corner';
        if (used.has(candidate)) {
          candidate = `${candidate}_${row.corner_id.replace(/-/g, '').slice(0, 8)}`;
        }
        used.add(candidate);
        await queryRunner.query(
          `UPDATE corners SET code = ? WHERE corner_id = ?`,
          [candidate, row.corner_id],
        );
      }
    }

    if (!(await this.indexExists(queryRunner, 'IDX_corners_code'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX IDX_corners_code ON corners (code)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner, 'IDX_corners_code')) {
      await queryRunner.query(`DROP INDEX IDX_corners_code ON corners`);
    }
    if (await this.columnExists(queryRunner, 'code')) {
      await queryRunner.query(`ALTER TABLE corners DROP COLUMN code`);
    }
  }
}
