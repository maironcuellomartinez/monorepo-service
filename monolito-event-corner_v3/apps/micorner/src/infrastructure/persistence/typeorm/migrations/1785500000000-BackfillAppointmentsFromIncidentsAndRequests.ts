import { MigrationInterface, QueryRunner } from 'typeorm';

// Backfill de datos (rollout strangler, Fase 2): copia el historial de
// `incidents`/`requests` hacia `appointments`/`appointment_slots`/
// `servicenow_ticket_links`/`appointment_timeline`. NO borra ni modifica las
// tablas de origen — estas quedan de solo lectura hasta el burn-in (Fase 7).
//
// Idempotente y re-ejecutable: cada INSERT usa `WHERE NOT EXISTS` contra la
// PK de destino, así que correrla dos veces (ej. tras una falla parcial) no
// duplica filas.
//
// issue_id: las filas migradas CONSERVAN su issue_id original — los
// contadores 'incident'/'request' de issue_sequences nunca colisionaron
// entre sí, así que no hay riesgo de duplicados al unificar ambos espacios
// en una sola tabla. El contador nuevo 'appointment' (sembrado más abajo)
// solo se usa para citas creadas DESPUÉS del backfill.
export class BackfillAppointmentsFromIncidentsAndRequests1785500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. appointments <- incidents (kind=ISSUE) ────────────────────────────
    await queryRunner.query(`
      INSERT INTO appointments (
        appointment_id, issue_id, kind, issue_type_id, customer_id, company_id,
        corner_id, device_id, locker_id, current_technician_id, created_by_technician_id,
        status, priority, origin_channel, scheduled_start, scheduled_end, duration_minutes,
        metadata, closed_at, estimated_close_at, comment, created_at, updated_at
      )
      SELECT
        i.incident_id, i.issue_id, 'ISSUE', i.issue_type_id, i.customer_id,
        -- Fallback '' solo por completitud del backfill: en la práctica todo
        -- customer que crea un incident pertenece a una company (invariante
        -- de negocio de más arriba en el flujo); no debería dispararse nunca.
        COALESCE(u.company_id, ''),
        i.corner_id, i.device_id, i.locker_id, i.current_technician_id, NULL,
        i.status, i.priority, i.origin_channel, i.scheduled_start, i.scheduled_end, i.duration_minutes,
        i.metadata, i.closed_at, i.estimated_close_at, i.comment, i.created_at, i.updated_at
      FROM incidents i
      LEFT JOIN users u ON u.customer_id = i.customer_id
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments a WHERE a.appointment_id = i.incident_id
      )
    `);

    // ── 2. appointments <- requests (kind=REQUEST) ───────────────────────────
    // Requests no tenían priority/origin_channel/duration real (solo un
    // scheduled_at puntual, sin slot reservado) — se completan con valores
    // por defecto informativos; no afectan disponibilidad porque estas filas
    // migradas no reciben appointment_slots (ver paso 3).
    await queryRunner.query(`
      INSERT INTO appointments (
        appointment_id, issue_id, kind, issue_type_id, customer_id, company_id,
        corner_id, device_id, locker_id, current_technician_id, created_by_technician_id,
        status, priority, origin_channel, scheduled_start, scheduled_end, duration_minutes,
        metadata, closed_at, estimated_close_at, comment, created_at, updated_at
      )
      SELECT
        r.request_id, r.issue_id, 'REQUEST', r.issue_type_id, r.customer_id, r.company_id,
        r.corner_id, r.device_id, NULL, r.technician_id, r.technician_id,
        r.status, 3, 'TECH_APP', r.scheduled_at, DATE_ADD(r.scheduled_at, INTERVAL 15 MINUTE), 15,
        NULL, r.closed_at, NULL, r.notes, r.created_at, r.updated_at
      FROM requests r
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments a WHERE a.appointment_id = r.request_id
      )
    `);

    // ── 3. appointment_slots <- incident_slots (requests no tenían slot real) ─
    await queryRunner.query(`
      INSERT INTO appointment_slots (relation_id, appointment_id, slot_id, created_at)
      SELECT s.relation_id, s.incident_id, s.slot_id, s.created_at
      FROM incident_slots s
      WHERE NOT EXISTS (
        SELECT 1 FROM appointment_slots aps WHERE aps.relation_id = s.relation_id
      )
    `);

    // ── 4. servicenow_ticket_links <- incidents (type=incident) ──────────────
    await queryRunner.query(`
      INSERT INTO servicenow_ticket_links (
        id, appointment_id, type, role, sys_id, number, parent_request_sys_id,
        snowq_correlation_id, status, closed_at, created_at, updated_at
      )
      SELECT
        UUID(), i.incident_id, 'incident', 'primary', i.servicenow_id, i.servicenow_number, NULL,
        i.snowq_correlation_id,
        CASE
          WHEN i.closed_at IS NOT NULL THEN 'CLOSED'
          WHEN i.servicenow_id IS NOT NULL THEN 'ACTIVE'
          WHEN i.snowq_correlation_id IS NOT NULL THEN 'PENDING'
          ELSE 'PENDING'
        END,
        i.closed_at, i.created_at, i.updated_at
      FROM incidents i
      WHERE (i.servicenow_id IS NOT NULL OR i.servicenow_number IS NOT NULL OR i.snowq_correlation_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM servicenow_ticket_links l WHERE l.appointment_id = i.incident_id AND l.type = 'incident'
        )
    `);

    // ── 5. servicenow_ticket_links <- requests (type=sc_req_item, la RITM) ───
    await queryRunner.query(`
      INSERT INTO servicenow_ticket_links (
        id, appointment_id, type, role, sys_id, number, parent_request_sys_id,
        snowq_correlation_id, status, closed_at, created_at, updated_at
      )
      SELECT
        UUID(), r.request_id, 'sc_req_item', 'primary', r.servicenow_id, r.servicenow_number, NULL,
        r.snowq_correlation_id,
        CASE
          WHEN r.closed_at IS NOT NULL THEN 'CLOSED'
          WHEN r.servicenow_id IS NOT NULL THEN 'ACTIVE'
          WHEN r.snowq_correlation_id IS NOT NULL THEN 'PENDING'
          ELSE 'PENDING'
        END,
        r.closed_at, r.created_at, r.updated_at
      FROM requests r
      WHERE (r.servicenow_id IS NOT NULL OR r.servicenow_number IS NOT NULL OR r.snowq_correlation_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM servicenow_ticket_links l WHERE l.appointment_id = r.request_id AND l.type = 'sc_req_item'
        )
    `);

    // ── 6. appointment_timeline <- incident_timeline + request_activities ────
    await queryRunner.query(`
      INSERT INTO appointment_timeline (
        activity_id, appointment_id, technician_id, action_type, from_status, to_status,
        worked_from, worked_until, comment, created_at
      )
      SELECT t.activity_id, t.incident_id, t.technician_id, t.action_type, t.from_status, t.to_status,
             t.worked_from, t.worked_until, t.comment, t.created_at
      FROM incident_timeline t
      WHERE NOT EXISTS (
        SELECT 1 FROM appointment_timeline at2 WHERE at2.activity_id = t.activity_id
      )
    `);

    await queryRunner.query(`
      INSERT INTO appointment_timeline (
        activity_id, appointment_id, technician_id, action_type, from_status, to_status,
        worked_from, worked_until, comment, created_at
      )
      SELECT ra.activity_id, ra.request_id, ra.technician_id, 'REQUEST_STATUS_CHANGED',
             ra.from_status, ra.to_status, NULL, NULL, ra.comment, ra.created_at
      FROM request_activities ra
      WHERE NOT EXISTS (
        SELECT 1 FROM appointment_timeline at2 WHERE at2.activity_id = ra.activity_id
      )
    `);

    // ── 7. Sembrar el contador 'appointment' por encima del máximo histórico ──
    const [maxRow]: Array<{ maxId: number | null }> = await queryRunner.query(
      `SELECT MAX(issue_id) AS maxId FROM appointments`,
    );
    await queryRunner.query(
      `INSERT INTO issue_sequences (entity_name, next_value) VALUES ('appointment', ?)
         ON DUPLICATE KEY UPDATE next_value = GREATEST(next_value, VALUES(next_value))`,
      [Number(maxRow?.maxId ?? 0) + 1],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Down intencionalmente no revierte el backfill (es aditivo y
    // re-ejecutable) — solo quita el contador de secuencia que sembró.
    await queryRunner.query(`DELETE FROM issue_sequences WHERE entity_name = 'appointment'`);
  }
}
