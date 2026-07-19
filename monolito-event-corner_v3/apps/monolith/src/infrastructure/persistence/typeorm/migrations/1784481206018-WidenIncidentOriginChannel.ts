import { MigrationInterface, QueryRunner } from 'typeorm';

// El envio de lotes crea incidencias con origin 'event-corner-app-batch'
// (22 chars) pero origin_channel era varchar(20): el INSERT fallaba con
// "Data too long for column 'origin_channel'".
export class WidenIncidentOriginChannel1784481206018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE incidents MODIFY COLUMN origin_channel VARCHAR(30) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE incidents MODIFY COLUMN origin_channel VARCHAR(20) NOT NULL`,
    );
  }
}
