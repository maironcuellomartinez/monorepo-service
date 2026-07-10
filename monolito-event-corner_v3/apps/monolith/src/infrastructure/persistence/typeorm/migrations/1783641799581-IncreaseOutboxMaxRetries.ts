import { MigrationInterface, QueryRunner } from 'typeorm';

// Sube el default de outbox_events.max_retries de 3 a 5 (~2.5 min de ventana de
// backoff en vez de ~35s) para absorber blips cortos de infra (reinicio de pod,
// rolling deploy de snowq) sin caer a huérfana. Necesaria porque `synchronize`
// está deshabilitado en producción (NODE_ENV === 'production').
export class IncreaseOutboxMaxRetries1783641799581 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE outbox_events MODIFY COLUMN max_retries INT NOT NULL DEFAULT 5`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE outbox_events MODIFY COLUMN max_retries INT NOT NULL DEFAULT 3`);
    }
}
