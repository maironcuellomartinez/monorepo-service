import { MigrationInterface, QueryRunner } from 'typeorm';

/* 
 One-shot migration: drops FK constraints on corner_slots so TypeORM synchronize
 can freely drop/recreate idx_corner_starts_status_held (MySQL ER_DROP_INDEX_FK).
 After this runs, synchronize recreates the FKs automatically. 
 */
export class DropCornerSlotsFKForResync1745088000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const fks: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(`
            SELECT CONSTRAINT_NAME
            FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_NAME = 'corner_slots'
              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
              AND TABLE_SCHEMA = DATABASE()
        `);
    for (const fk of fks) {
      await queryRunner.query(
        `ALTER TABLE corner_slots DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // FKs are recreated by TypeORM synchronize — no manual rollback needed
  }
}
