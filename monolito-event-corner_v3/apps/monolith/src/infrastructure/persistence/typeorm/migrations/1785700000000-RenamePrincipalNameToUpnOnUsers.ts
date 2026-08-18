import { MigrationInterface, QueryRunner } from 'typeorm';

// `principal_name` ya funcionaba como User Principal Name (UPN, identidad de
// login vía Entra ID) — se renombra para que el nombre coincida con el
// vocabulario real (legacy la llama `upn`). `email` queda intacto: es un
// campo de contacto separado, hoy poblado con el mismo valor por conveniencia,
// pero pensado para divergir a futuro (envío de notificaciones).
//
// upn es único: es el identificador real de login/identidad (legacy:
// x<empleadoId>@dominio / N<empleadoId>@dominio) — NULL múltiples sí se
// permiten (MySQL no los considera duplicados en un índice UNIQUE).
export class RenamePrincipalNameToUpnOnUsers1785700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users CHANGE COLUMN principal_name upn VARCHAR(200) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE users ADD UNIQUE INDEX idx_users_upn (upn)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP INDEX idx_users_upn`);
    await queryRunner.query(
      `ALTER TABLE users CHANGE COLUMN upn principal_name VARCHAR(200) NULL`,
    );
  }
}
