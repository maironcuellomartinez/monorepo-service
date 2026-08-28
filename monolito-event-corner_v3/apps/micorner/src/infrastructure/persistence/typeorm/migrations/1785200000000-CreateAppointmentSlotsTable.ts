import { MigrationInterface, QueryRunner } from 'typeorm';

// Tabla de ocupación de slots para Appointment — mirror de `incident_slots`.
// A diferencia de `requests` hoy (que solo tenía un `scheduled_at` sin
// reserva real de slot), toda Appointment (ISSUE o REQUEST) ocupa >=1 slot
// real desde el día uno, cerrando el gap de doble-booking contra citas
// tipo REQUEST que availability.service.ts tiene hoy (solo mira incidents).
export class CreateAppointmentSlotsTable1785200000000 implements MigrationInterface {
  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'appointment_slots')) return;

    await queryRunner.query(`
      CREATE TABLE appointment_slots (
        relation_id VARCHAR(36) NOT NULL PRIMARY KEY,
        appointment_id VARCHAR(50) NOT NULL,
        slot_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE INDEX uq_appointment_slot (appointment_id, slot_id),
        INDEX idx_appointment_slots_slot (slot_id)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'appointment_slots')) {
      await queryRunner.query(`DROP TABLE appointment_slots`);
    }
  }
}
