import { MigrationInterface, QueryRunner } from 'typeorm';

// La sincronización manual (POST /companies/sync-from-sn) y el cron
// SnCompanySyncJob deduplican comparando contra un snapshot en memoria de
// snow_company_sys_id, no contra una constraint de BD — si ambos corren en
// simultáneo pueden crear ServiceNowProfile duplicados para el mismo sys_id.
// Antes de agregar el índice único se eliminan duplicados existentes,
// conservando el registro más antiguo por snow_company_sys_id.
export class AddUniqueSnowCompanySysIdToServiceNowProfiles1784324876162 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DELETE t1 FROM servicenow_profiles t1
            INNER JOIN servicenow_profiles t2
                ON t1.snow_company_sys_id = t2.snow_company_sys_id
                AND (
                    t1.created_at > t2.created_at
                    OR (t1.created_at = t2.created_at AND t1.profile_id > t2.profile_id)
                )
        `);
    await queryRunner.query(`
            ALTER TABLE servicenow_profiles
            ADD UNIQUE INDEX uq_servicenow_profiles_snow_company_sys_id (snow_company_sys_id)
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE servicenow_profiles
            DROP INDEX uq_servicenow_profiles_snow_company_sys_id
        `);
  }
}
