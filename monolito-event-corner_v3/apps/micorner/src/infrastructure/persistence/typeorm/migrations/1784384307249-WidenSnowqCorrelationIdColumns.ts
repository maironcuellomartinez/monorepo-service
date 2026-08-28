import { MigrationInterface, QueryRunner } from 'typeorm';

// El api-gateway antepone el prefijo 'snowq:' (SNOWQ_PREFIX en
// servicenow-outbound.controller.ts) al correlationId de 36 chars (UUID) que
// devuelve api-snowq-service, dando 42 chars — pero snowq_correlation_id era
// varchar(36), así que el UPDATE fallaba con "Data too long for column".
export class WidenSnowqCorrelationIdColumns1784384307249 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE incidents MODIFY COLUMN snowq_correlation_id VARCHAR(64) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE requests MODIFY COLUMN snowq_correlation_id VARCHAR(64) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE incidents MODIFY COLUMN snowq_correlation_id VARCHAR(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE requests MODIFY COLUMN snowq_correlation_id VARCHAR(36) NULL`,
    );
  }
}
