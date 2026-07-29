import { MigrationInterface, QueryRunner } from 'typeorm';

// Primera pieza del remodelado de dominio Appointment: tabla nueva que
// convive con `incidents`/`requests` (rollout tipo strangler). No se toca
// código existente todavía — esta migración solo crea la tabla, sin backfill
// (eso llega en BackfillAppointmentsFromIncidentsAndRequests, Fase 2).
//
// Sin FKs a nivel de motor (mismo patrón que `incidents`/`requests`: IDs
// varchar generados en aplicación, no AUTO_INCREMENT — ver el comentario en
// AppointmentEntity.appointment_id).
//
// Idempotente: en dev synchronize=true ya crea la tabla desde la entity
// (AppointmentEntity) antes de correr las migraciones — mismo patrón que
// el resto de las migraciones de este archivo.
export class CreateAppointmentsTable1785100000000 implements MigrationInterface {
  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const rows: Array<{ cnt: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'appointments')) return;

    await queryRunner.query(`
      CREATE TABLE appointments (
        appointment_id VARCHAR(50) NOT NULL PRIMARY KEY,
        issue_id INT UNSIGNED NOT NULL,
        kind VARCHAR(20) NOT NULL,
        issue_type_id VARCHAR(50) NOT NULL,
        customer_id VARCHAR(50) NOT NULL,
        company_id VARCHAR(50) NOT NULL,
        corner_id VARCHAR(50) NOT NULL,
        device_id VARCHAR(50) NULL,
        locker_id VARCHAR(50) NULL,
        current_technician_id VARCHAR(50) NULL,
        created_by_technician_id VARCHAR(50) NULL,
        status VARCHAR(50) NOT NULL,
        priority INT NOT NULL,
        origin_channel VARCHAR(30) NOT NULL,
        scheduled_start TIMESTAMP NOT NULL,
        scheduled_end TIMESTAMP NOT NULL,
        duration_minutes INT NOT NULL,
        metadata JSON NULL,
        closed_at TIMESTAMP NULL,
        estimated_close_at TIMESTAMP NULL,
        comment TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_appointments_customer (customer_id),
        INDEX idx_appointments_company (company_id),
        INDEX idx_appointments_corner (corner_id),
        INDEX idx_appointments_technician (current_technician_id),
        INDEX idx_appointments_status (status),
        INDEX idx_appointments_kind (kind)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'appointments')) {
      await queryRunner.query(`DROP TABLE appointments`);
    }
  }
}
