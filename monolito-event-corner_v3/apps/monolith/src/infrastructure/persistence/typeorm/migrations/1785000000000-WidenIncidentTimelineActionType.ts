import { MigrationInterface, QueryRunner } from 'typeorm';

// action_type era varchar(20), pero varios event.type reales del dominio superan
// ese largo (ej. 'INCIDENT_STATUS_CHANGED' = 23 chars, 'INCIDENT_ESTIMATED_CLOSE_CHANGED'
// = 32 chars) — el INSERT fallaba con "Data too long for column" en
// TypeOrmIncidentRepository.saveEvents(), cuyo Result de error no se valida en
// IncidentService (a diferencia de saveResult), así que el fallo quedaba silencioso:
// el estado cambiaba pero el timeline nunca registraba el evento. Mismo patrón que
// WidenSnowqCorrelationIdColumns.
export class WidenIncidentTimelineActionType1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE incident_timeline MODIFY COLUMN action_type VARCHAR(40) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE incident_timeline MODIFY COLUMN action_type VARCHAR(20) NOT NULL`,
    );
  }
}
