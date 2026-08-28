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
//
// Idempotente a propósito: en dev, `synchronize: true` ya venía renombrando
// la columna (y creando su propio índice único con nombre autogenerado)
// mucho antes de que esta migración existiera — correrla tal cual ahí
// revienta con "Unknown column 'principal_name'" y tumba el arranque del
// micorner entero (migrationsRun: true). Se verifica el estado real de la
// tabla antes de cada paso en vez de asumir el estado "recién nacido"
// (staging/prod) o el estado "ya sincronizado" (dev) — sirve para ambos.
export class RenamePrincipalNameToUpnOnUsers1785700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOldColumn = await queryRunner.hasColumn('users', 'principal_name');
    if (hasOldColumn) {
      await queryRunner.query(
        `ALTER TABLE users CHANGE COLUMN principal_name upn VARCHAR(200) NULL`,
      );
    }

    const table = await queryRunner.getTable('users');
    const hasUpnUniqueIndex = table?.indices.some(
      (idx) => idx.isUnique && idx.columnNames.length === 1 && idx.columnNames[0] === 'upn',
    );
    if (!hasUpnUniqueIndex) {
      await queryRunner.query(
        `ALTER TABLE users ADD UNIQUE INDEX idx_users_upn (upn)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const upnIndex = table?.indices.find(
      (idx) => idx.isUnique && idx.columnNames.length === 1 && idx.columnNames[0] === 'upn',
    );
    if (upnIndex) {
      await queryRunner.query(`ALTER TABLE users DROP INDEX \`${upnIndex.name}\``);
    }

    const hasUpnColumn = await queryRunner.hasColumn('users', 'upn');
    const hasOldColumn = await queryRunner.hasColumn('users', 'principal_name');
    if (hasUpnColumn && !hasOldColumn) {
      await queryRunner.query(
        `ALTER TABLE users CHANGE COLUMN upn principal_name VARCHAR(200) NULL`,
      );
    }
  }
}
