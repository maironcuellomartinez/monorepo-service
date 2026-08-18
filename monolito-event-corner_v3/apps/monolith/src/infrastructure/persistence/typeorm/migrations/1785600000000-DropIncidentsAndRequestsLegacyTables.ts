import { MigrationInterface, QueryRunner } from 'typeorm';

// Cierre del remodelado de dominio Appointment (strangler): las tablas
// `incidents`/`requests` y sus auxiliares ya fueron migradas por completo a
// `appointments`/`appointment_slots`/`servicenow_ticket_links`/
// `appointment_timeline` (ver BackfillAppointmentsFromIncidentsAndRequests) y
// verificadas — ningún código de aplicación las lee ni las escribe desde que
// se retiraron IncidentService/RequestService y sus repositorios.
//
// down() recrea las tablas VACÍAS (misma forma) para que un rollback no deje
// el esquema en un estado indefinido, pero NO restaura datos — si hace falta
// recuperar el contenido histórico, restaurar desde el backup tomado antes de
// correr esta migración (dump JSON de las 5 tablas).
export class DropIncidentsAndRequestsLegacyTables1785600000000
  implements MigrationInterface
{
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

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Orden: hijos primero (join/audit tables), padres al final.
    for (const table of [
      'incident_slots',
      'incident_timeline',
      'request_activities',
      'requests',
      'incidents',
    ]) {
      if (await this.tableExists(queryRunner, table)) {
        await queryRunner.query(`DROP TABLE ${table}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'incidents'))) {
      await queryRunner.query(`
        CREATE TABLE incidents (
          incident_id VARCHAR(50) NOT NULL PRIMARY KEY,
          issue_id INT UNSIGNED NOT NULL,
          issue_type_id VARCHAR(50) NOT NULL,
          customer_id VARCHAR(50) NOT NULL,
          corner_id VARCHAR(50) NOT NULL,
          device_id VARCHAR(50) NULL,
          locker_id VARCHAR(50) NULL,
          current_technician_id VARCHAR(50) NULL,
          status VARCHAR(50) NOT NULL,
          priority INT NOT NULL,
          origin_channel VARCHAR(30) NOT NULL,
          scheduled_start TIMESTAMP NOT NULL,
          scheduled_end TIMESTAMP NOT NULL,
          duration_minutes INT NOT NULL,
          servicenow_id VARCHAR(100) NULL,
          servicenow_number VARCHAR(50) NULL,
          snowq_correlation_id VARCHAR(64) NULL,
          metadata JSON NULL,
          closed_at TIMESTAMP NULL,
          estimated_close_at TIMESTAMP NULL,
          comment TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
    }
    if (!(await this.tableExists(queryRunner, 'incident_slots'))) {
      await queryRunner.query(`
        CREATE TABLE incident_slots (
          relation_id VARCHAR(36) NOT NULL PRIMARY KEY,
          incident_id VARCHAR(50) NOT NULL,
          slot_id VARCHAR(50) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
    }
    if (!(await this.tableExists(queryRunner, 'incident_timeline'))) {
      await queryRunner.query(`
        CREATE TABLE incident_timeline (
          activity_id VARCHAR(36) NOT NULL PRIMARY KEY,
          incident_id VARCHAR(50) NOT NULL,
          technician_id VARCHAR(50) NULL,
          action_type VARCHAR(40) NOT NULL,
          from_status VARCHAR(20) NULL,
          to_status VARCHAR(20) NULL,
          worked_from TIMESTAMP NULL,
          worked_until TIMESTAMP NULL,
          comment VARCHAR(500) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
    }
    if (!(await this.tableExists(queryRunner, 'requests'))) {
      await queryRunner.query(`
        CREATE TABLE requests (
          request_id VARCHAR(50) NOT NULL PRIMARY KEY,
          issue_id INT UNSIGNED NOT NULL,
          issue_type_id VARCHAR(50) NOT NULL,
          technician_id VARCHAR(50) NOT NULL,
          customer_id VARCHAR(50) NOT NULL,
          corner_id VARCHAR(50) NOT NULL,
          company_id VARCHAR(50) NOT NULL,
          device_id VARCHAR(50) NULL,
          status VARCHAR(20) NOT NULL,
          scheduled_at TIMESTAMP NOT NULL,
          servicenow_id VARCHAR(100) NULL,
          servicenow_number VARCHAR(50) NULL,
          snowq_correlation_id VARCHAR(64) NULL,
          notes TEXT NULL,
          closed_at TIMESTAMP NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
    }
    if (!(await this.tableExists(queryRunner, 'request_activities'))) {
      await queryRunner.query(`
        CREATE TABLE request_activities (
          activity_id VARCHAR(36) NOT NULL PRIMARY KEY,
          request_id VARCHAR(50) NOT NULL,
          technician_id VARCHAR(50) NOT NULL,
          from_status VARCHAR(20) NULL,
          to_status VARCHAR(20) NOT NULL,
          comment VARCHAR(500) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
    }
  }
}
