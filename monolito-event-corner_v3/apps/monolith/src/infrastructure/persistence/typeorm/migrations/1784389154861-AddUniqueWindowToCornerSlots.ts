import { MigrationInterface, QueryRunner } from 'typeorm';

// corner_slots no tenía unicidad por franja horaria: dos schedules solapados
// (o una doble generación fire-and-forget) podían crear filas duplicadas para
// la misma ventana de un corner, y la disponibilidad no sabe desambiguarlas
// (ventanas deslizantes mezclan filas → falsos disponibles/ocupados).
// Antes de crear el índice único se eliminan duplicados existentes conservando
// la fila de mayor prioridad de negocio (BOOKED > HELD > AVAILABLE > EXPIRED;
// a igual estado, la de slot_id menor). Si dos filas BOOKED compartieran
// ventana (doble reserva ya materializada), sobrevive una sola: la incidencia
// que referenciaba la otra conserva su scheduled_range pero queda con la
// referencia de slot colgante en incident_slots (la FK se eliminó en
// DropCornerSlotsFKForResync).
export class AddUniqueWindowToCornerSlots1784389154861 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DELETE t1 FROM corner_slots t1
            INNER JOIN corner_slots t2
                ON t1.corner_id = t2.corner_id
                AND t1.starts_at = t2.starts_at
                AND t1.ends_at = t2.ends_at
                AND t1.slot_id <> t2.slot_id
                AND (
                    FIELD(t1.status, 'BOOKED', 'HELD', 'AVAILABLE', 'EXPIRED')
                        > FIELD(t2.status, 'BOOKED', 'HELD', 'AVAILABLE', 'EXPIRED')
                    OR (
                        FIELD(t1.status, 'BOOKED', 'HELD', 'AVAILABLE', 'EXPIRED')
                            = FIELD(t2.status, 'BOOKED', 'HELD', 'AVAILABLE', 'EXPIRED')
                        AND t1.slot_id > t2.slot_id
                    )
                )
        `);
    // En dev synchronize=true corre antes que las migraciones y ya crea el
    // índice desde el decorator de la entidad — crear solo si no existe.
    const [{ cnt }] = await queryRunner.query(`
            SELECT COUNT(DISTINCT index_name) AS cnt
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'corner_slots'
              AND index_name = 'uq_corner_slot_window'
        `);
    if (Number(cnt) === 0) {
      await queryRunner.query(`
                ALTER TABLE corner_slots
                ADD UNIQUE INDEX uq_corner_slot_window (corner_id, starts_at, ends_at)
            `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE corner_slots
            DROP INDEX uq_corner_slot_window
        `);
  }
}
