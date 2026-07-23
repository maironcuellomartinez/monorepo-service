import { MigrationInterface, QueryRunner } from 'typeorm';

// Agrega los atributos de clasificación de ServiceNow al catálogo de tipos de
// incidencia (issue_types): urgency/impact (1–3) y severity (u_severity en SN).
// Hasta ahora el api-gateway hardcodeaba estos valores (2/2/'medium') al armar
// el payload hacia api-snowq-service; ahora cada IssueType puede definirlos.
// Los defaults replican el comportamiento previo, así que las filas existentes
// y el flujo actual no cambian hasta que un admin configure un tipo.
export class AddSnClassificationToIssueTypes1784600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE issue_types ADD COLUMN sn_urgency INT NOT NULL DEFAULT 2`,
    );
    await queryRunner.query(
      `ALTER TABLE issue_types ADD COLUMN sn_impact INT NOT NULL DEFAULT 2`,
    );
    await queryRunner.query(
      `ALTER TABLE issue_types ADD COLUMN sn_severity VARCHAR(20) NOT NULL DEFAULT 'medium'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issue_types DROP COLUMN sn_severity`);
    await queryRunner.query(`ALTER TABLE issue_types DROP COLUMN sn_impact`);
    await queryRunner.query(`ALTER TABLE issue_types DROP COLUMN sn_urgency`);
  }
}
