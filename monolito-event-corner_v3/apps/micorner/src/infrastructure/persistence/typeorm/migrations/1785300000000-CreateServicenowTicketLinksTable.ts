import { MigrationInterface, QueryRunner } from 'typeorm';

// Vínculo polimórfico Appointment -> ticket ServiceNow (incident | sc_req_item
// | sc_task), cardinalidad 1:N. Reemplaza las columnas servicenow_id/number/
// snowq_correlation_id que hoy viven inline en `incidents`/`requests` — acá
// quedan en filas propias para poder representar tanto la RITM de una
// Request-kind appointment como sus sc_task de cumplimiento, y para dejar un
// registro `ABANDONED` en vez de sobreescribir en recuperación de huérfanos.
export class CreateServicenowTicketLinksTable1785300000000 implements MigrationInterface {
  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'servicenow_ticket_links')) return;

    await queryRunner.query(`
      CREATE TABLE servicenow_ticket_links (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        appointment_id VARCHAR(50) NOT NULL,
        type VARCHAR(20) NOT NULL,
        role VARCHAR(20) NOT NULL,
        sys_id VARCHAR(100) NULL,
        number VARCHAR(50) NULL,
        parent_request_sys_id VARCHAR(100) NULL,
        snowq_correlation_id VARCHAR(64) NULL,
        status VARCHAR(20) NOT NULL,
        closed_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_snow_ticket_link_appointment (appointment_id),
        INDEX idx_snow_ticket_link_sys_id (sys_id),
        INDEX idx_snow_ticket_link_correlation (snowq_correlation_id),
        INDEX idx_snow_ticket_link_status (status)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'servicenow_ticket_links')) {
      await queryRunner.query(`DROP TABLE servicenow_ticket_links`);
    }
  }
}
