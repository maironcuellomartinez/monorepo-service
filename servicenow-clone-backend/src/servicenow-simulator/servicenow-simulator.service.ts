import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SnowTicketEntity } from './snow-ticket.entity';

// ─── Prefijos de número por tabla ────────────────────────────────────────────

const TABLE_NUMBER_PREFIXES: Record<string, string> = {
  incident: 'INC',
  sc_request: 'REQ',
  sc_req_item: 'RITM',
  sc_task: 'SCTASK',
  change_request: 'CHG',
  problem: 'PRB',
  kb_article: 'KB',
  kb_knowledge: 'KB',
  release_task: 'RTASK',
  cmdb_ci: 'CI',
  task: 'TASK',
  u_request: 'REQ',
};

const DEFAULT_PREFIX = 'TKT';
const NUMBER_PADDING = 7;

// ─── Estados SN por tabla ─────────────────────────────────────────────────────
//
// ServiceNow usa códigos numéricos (como string) para representar el estado.
// Cada tabla tiene su propio conjunto de estados.

/**
 * Estado inicial al crear un ticket.
 *  incident        → 1  (New)
 *  change_request  → -5 (New)
 *  problem         → 1  (Open)
 *  sc_req_item     → 1  (Open)
 */
const SN_INITIAL_STATE: Record<string, string> = {
  incident: '1',
  change_request: '-5',
  problem: '1',
  sc_req_item: '1',
  sc_task: '1',
};

/**
 * Estado SN cuando se recibe state='resolved'.
 *  incident        → 6 (Resolved)
 *  change_request  → 0 (Review)
 *  problem         → 4 (Closed/Resolved)
 *  sc_req_item     → 3 (Closed Complete)
 */
const SN_RESOLVED_STATE: Record<string, string> = {
  incident: '6',
  change_request: '0',
  problem: '4',
  sc_req_item: '3',
  sc_task: '3',
};

/**
 * Estado SN cuando se recibe state='closed'.
 *  incident        → 7 (Closed)
 *  change_request  → 3 (Closed)
 *  problem         → 4 (Closed/Resolved)
 *  sc_req_item     → 3 (Closed Complete)
 */
const SN_CLOSED_STATE: Record<string, string> = {
  incident: '7',
  change_request: '3',
  problem: '4',
  sc_req_item: '3',
  sc_task: '3',
};

/**
 * Estados numéricos que implican cierre del ticket (por tabla).
 * Alineado con SN_CLOSED_STATES en api-snowq-service:
 *   new Set(['resolved', 'closed', '6', '7', '3'])
 */
const SN_CLOSING_STATES: Record<string, Set<string>> = {
  incident: new Set(['6', '7']),
  change_request: new Set(['0', '3']),
  problem: new Set(['4']),
  sc_req_item: new Set(['3', '4']),
  sc_task: new Set(['3', '4']),
};

/** Labels legibles para mostrar en logs y respuestas */
const SN_STATE_LABELS: Record<string, Record<string, string>> = {
  incident: {
    '1': 'New',
    '2': 'In Progress',
    '3': 'On Hold',
    '6': 'Resolved',
    '7': 'Closed',
    '8': 'Canceled',
  },
  change_request: {
    '-5': 'New',
    '-4': 'Assess',
    '-3': 'Authorize',
    '-2': 'Scheduled',
    '-1': 'Implement',
    '0': 'Review',
    '3': 'Closed',
  },
  problem: {
    '1': 'Open',
    '2': 'Known Error',
    '3': 'Pending Change',
    '4': 'Closed/Resolved',
  },
  sc_req_item: {
    '1': 'Open',
    '2': 'Work in Progress',
    '3': 'Closed Complete',
    '4': 'Closed Incomplete',
    '7': 'Canceled',
  },
  sc_task: {
    '1': 'Open',
    '2': 'Work in Progress',
    '3': 'Closed Complete',
    '4': 'Closed Incomplete',
    '7': 'Canceled',
  },
};

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export interface SnowRecord {
  sys_id: string;
  number: string;
  sys_class_name: string;
  sys_created_on: string;
  sys_updated_on: string;
  state: string;
  [key: string]: unknown;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ServicenowSimulatorService {
  private readonly logger = new Logger('SN-Clone-Service');

  constructor(
    @InjectRepository(SnowTicketEntity)
    private readonly repo: Repository<SnowTicketEntity>,
  ) { }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private getPrefix(tableName: string): string {
    return TABLE_NUMBER_PREFIXES[tableName] ?? DEFAULT_PREFIX;
  }

  private getInitialState(tableName: string): string {
    return SN_INITIAL_STATE[tableName] ?? '1';
  }

  /**
   * Mapea el state entrante (string semántico o código numérico) al código
   * numérico que usa ServiceNow internamente para esa tabla.
   *
   * Ejemplos:
   *   'resolved' + incident      → '6'
   *   'closed'   + change_request → '3'
   *   '2'                        → '2'  (pass-through)
   *   'open'     + incident      → '1'
   */
  private mapIncomingState(tableName: string, incomingState: unknown): string | null {
    if (incomingState === undefined || incomingState === null) return null;

    const s = String(incomingState).trim();

    // Ya es un código numérico SN — pass-through
    if (/^-?\d+$/.test(s)) return s;

    const lower = s.toLowerCase();

    if (lower === 'resolved') return SN_RESOLVED_STATE[tableName] ?? '6';
    if (lower === 'closed') return SN_CLOSED_STATE[tableName] ?? '7';
    if (lower === 'open' || lower === 'new') return SN_INITIAL_STATE[tableName] ?? '1';
    if (lower === 'in_progress' || lower === 'in progress' || lower === 'work in progress')
      return '2';
    if (lower === 'on_hold' || lower === 'on hold') return '3';
    if (lower === 'canceled' || lower === 'cancelled') return '8';

    // Desconocido: lo pasa tal cual para no perder información
    return s;
  }

  private isClosingState(tableName: string, state: string): boolean {
    const closing = SN_CLOSING_STATES[tableName] ?? new Set(['6', '7']);
    return closing.has(state);
  }

  private getStateLabel(tableName: string, state: string): string {
    return SN_STATE_LABELS[tableName]?.[state] ?? state;
  }

  private toSysId(): string {
    return randomUUID().replace(/-/g, '');
  }

  private toSnowDate(date: Date): string {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Construye la respuesta SN-like a partir de la entidad almacenada.
   *
   * Estructura final:
   *  - Todos los campos del payload original (short_description, caller_id, etc.)
   *  - Campos de sistema con prioridad sobre el payload (sys_id, number, state, etc.)
   *  - Campos de cierre siempre presentes (close_code, close_notes)
   *  - resolved_at siempre presente (vacío si no aplica)
   */
  private toSnowRecord(entity: SnowTicketEntity): SnowRecord {
    const payload = entity.payload ?? {};
    const stateLabel = this.getStateLabel(entity.table_name, entity.state);

    return {
      // Todos los campos del payload (category, urgency, impact, caller_id, company, etc.)
      ...payload,

      // Campos de sistema — sobrescriben cualquier homónimo del payload
      sys_id: entity.sys_id,
      number: entity.number,
      sys_class_name: entity.table_name,
      state: entity.state,
      state_label: stateLabel,
      sys_created_on: this.toSnowDate(entity.created_at),
      sys_updated_on: this.toSnowDate(entity.updated_at),

      // Cierre — siempre presentes para evitar undefined en el cliente
      resolved_at: entity.resolved_at ? this.toSnowDate(entity.resolved_at) : '',
      close_code: (payload.close_code as string) ?? '',
      close_notes: (payload.close_notes as string) ?? '',
    };
  }

  // ─── Operaciones públicas ──────────────────────────────────────────────────

  /**
   * Crea un nuevo ticket.
   *
   * El número se genera dentro de una transacción con SELECT ... FOR UPDATE
   * para serializar accesos concurrentes y evitar colisiones de número único.
   *
   * El estado inicial se determina por tipo de tabla (SN_INITIAL_STATE):
   *   incident → '1' (New), change_request → '-5' (New), etc.
   */
  async create(tableName: string, body: Record<string, unknown>): Promise<SnowRecord> {
    return this.repo.manager.transaction(async (em) => {
      const prefix = this.getPrefix(tableName);

      const row = await em
        .createQueryBuilder(SnowTicketEntity, 't')
        .select('MAX(t.number)', 'maxNumber')
        .where('t.table_name = :tableName', { tableName })
        .setLock('pessimistic_write')
        .getRawOne<{ maxNumber: string | null }>();

      const maxNumber = row?.maxNumber ?? null;
      let next = 1;
      if (maxNumber) {
        const numeric = parseInt(maxNumber.replace(prefix, ''), 10);
        if (!isNaN(numeric)) next = numeric + 1;
      }
      const number = `${prefix}${String(next).padStart(NUMBER_PADDING, '0')}`;

      const entity = em.create(SnowTicketEntity, {
        sys_id: this.toSysId(),
        number,
        table_name: tableName,
        state: this.getInitialState(tableName),
        payload: body,
        resolved_at: null,
      });

      await em.save(entity);
      return this.toSnowRecord(entity);
    });
  }

  /**
   * Obtiene todos los tickets de una tabla.
   * @param {string} tableName - Nombre de la tabla.
   * @returns {Promise<SnowRecord[]>} Lista de tickets.
   * @description Ordena los tickets por fecha de creación descendente.
   */
  async findAll(tableName: string): Promise<SnowRecord[]> {
    const entities = await this.repo.find({
      where: { table_name: tableName },
      order: { created_at: 'DESC' },
    });
    return entities.map(e => this.toSnowRecord(e));
  }

  /**
   * Obtiene un ticket por ID.
   * @param tableName - Nombre de la tabla.
   * @param sys_id - ID del ticket.
   * @returns Ticket.
   */
  async findOne(tableName: string, sys_id: string): Promise<SnowRecord> {
    const entity = await this.repo.findOne({ where: { sys_id, table_name: tableName } });
    if (!entity) {
      this.logger.warn(`[NOT_FOUND] table=${tableName} sys_id=${sys_id}`);
      throw new NotFoundException(`Record ${sys_id} not found in table ${tableName}`);
    }
    return this.toSnowRecord(entity);
  }

  /**
   * Actualiza un ticket existente.
   *
   * El body entrante se mergea al payload. Si incluye `state`, se mapea al
   * código SN correspondiente según la tabla:
   *   'resolved' → '6' (incident) | '3' (sc_req_item) | etc.
   *   'closed'   → '7' (incident) | '3' (change_request) | etc.
   *   '2'        → '2' (pass-through)
   *
   * Si el nuevo estado es un estado de cierre para esa tabla y aún no tiene
   * resolved_at, se registra la fecha de resolución.
   */
  async update(tableName: string, sys_id: string, body: Record<string, unknown>): Promise<SnowRecord> {
    const entity = await this.repo.findOne({ where: { sys_id, table_name: tableName } });
    if (!entity) {
      this.logger.warn(`[NOT_FOUND] table=${tableName} sys_id=${sys_id}`);
      throw new NotFoundException(`Record ${sys_id} not found in table ${tableName}`);
    }

    // Merge payload (incluye close_code, close_notes, work_notes, etc.)
    entity.payload = { ...entity.payload, ...body };

    if (body.state !== undefined) {
      const mapped = this.mapIncomingState(tableName, body.state);
      if (mapped !== null) {
        entity.state = mapped;

        if (this.isClosingState(tableName, mapped) && !entity.resolved_at) {
          entity.resolved_at = new Date();
        }
      }
    }

    await this.repo.save(entity);
    return this.toSnowRecord(entity);
  }
}
