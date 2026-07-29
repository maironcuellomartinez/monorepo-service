import { MigrationInterface, QueryRunner } from 'typeorm';

// Mirror de `incident_timeline` (audit log append-only, no un event store
// real — ver AppointmentTimelineEntity). `action_type` ya arranca en
// VARCHAR(40) para no repetir el bug que forzó
// WidenIncidentTimelineActionType (columna original de 20 chars, muy
// angosta para eventos como 'INCIDENT_ESTIMATED_CLOSE_CHANGED').
export class CreateAppointmentTimelineTable1785400000000 implements MigrationInterface {
  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'appointment_timeline')) return;

    await queryRunner.query(`
      CREATE TABLE appointment_timeline (
        activity_id VARCHAR(36) NOT NULL PRIMARY KEY,
        appointment_id VARCHAR(50) NOT NULL,
        technician_id VARCHAR(50) NULL,
        action_type VARCHAR(40) NOT NULL,
        from_status VARCHAR(50) NULL,
        to_status VARCHAR(50) NULL,
        worked_from TIMESTAMP NULL,
        worked_until TIMESTAMP NULL,
        comment VARCHAR(500) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_appointment_timeline_appointment (appointment_id)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'appointment_timeline')) {
      await queryRunner.query(`DROP TABLE appointment_timeline`);
    }
  }
}
