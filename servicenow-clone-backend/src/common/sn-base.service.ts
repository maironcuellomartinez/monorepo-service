import { NotFoundException } from '@nestjs/common';
import {
  FindOptionsOrder,
  FindOptionsWhere,
  Repository,
  EntityManager,
} from 'typeorm';
import {
  SN_NUMBER_PREFIXES,
  SN_INITIAL_STATE,
  mapIncomingState,
  isClosingState,
  getStateLabel,
  toSnowDate,
  toSysId,
} from './sn-state.constants';

export interface SnowRecord {
  sys_id: string;
  number: string;
  sys_class_name: string;
  state: string;
  state_label: string;
  sys_created_on: string;
  sys_updated_on: string;
  resolved_at: string;
  close_code: string;
  close_notes: string;
  [key: string]: unknown;
}

/** Columnas comunes que toda entidad gestionada por SnBaseService posee */
interface SnEntityColumns {
  sys_id: string;
  number: string;
  state: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  close_code?: string | null;
  close_notes?: string | null;
}

export abstract class SnBaseService<E extends Record<string, any>> {
  protected abstract readonly SN_TABLE: string;
  protected abstract get repository(): Repository<E>;

  private get prefix(): string {
    return SN_NUMBER_PREFIXES[this.SN_TABLE] ?? 'TKT';
  }

  private get initialState(): string {
    return SN_INITIAL_STATE[this.SN_TABLE] ?? '1';
  }

  protected async generateNumber(em: EntityManager): Promise<string> {
    const prefix = this.prefix;
    const entityClass = this.repository.metadata.target;
    const row = await em
      .createQueryBuilder(entityClass as any, 't')
      .select('MAX(t.number)', 'maxNumber')
      .setLock('pessimistic_write')
      .getRawOne<{ maxNumber: string | null }>();

    let next = 1;
    if (row?.maxNumber) {
      const n = parseInt(row.maxNumber.replace(prefix, ''), 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(7, '0')}`;
  }

  protected toRecord(entity: E): SnowRecord {
    const {
      sys_id,
      number,
      state,
      created_at,
      updated_at,
      resolved_at,
      close_code,
      close_notes,
      ...rest
    } = entity as unknown as SnEntityColumns & Record<string, unknown>;
    return {
      ...rest,
      sys_id,
      number,
      sys_class_name: this.SN_TABLE,
      state,
      state_label: getStateLabel(this.SN_TABLE, state),
      sys_created_on: toSnowDate(created_at),
      sys_updated_on: toSnowDate(updated_at),
      resolved_at: resolved_at ? toSnowDate(resolved_at) : '',
      close_code: close_code ?? '',
      close_notes: close_notes ?? '',
    };
  }

  async create(body: Record<string, unknown>): Promise<SnowRecord> {
    return this.repository.manager.transaction(async (em) => {
      const number = await this.generateNumber(em);
      const entity = em.create(this.repository.metadata.target as any, {
        ...body,
        sys_id: toSysId(),
        number,
        state: this.initialState,
        resolved_at: null,
      });
      await em.save(entity);
      return this.toRecord(entity as E);
    });
  }

  async findAll(): Promise<SnowRecord[]> {
    const entities = await this.repository.find({
      order: { created_at: 'DESC' } as unknown as FindOptionsOrder<E>,
    });
    return entities.map((e) => this.toRecord(e));
  }

  async findOne(sys_id: string): Promise<SnowRecord> {
    const entity = await this.repository.findOne({
      where: { sys_id } as unknown as FindOptionsWhere<E>,
    });
    if (!entity)
      throw new NotFoundException(
        `Record ${sys_id} not found in ${this.SN_TABLE}`,
      );
    return this.toRecord(entity);
  }

  async update(
    sys_id: string,
    body: Record<string, unknown>,
  ): Promise<SnowRecord> {
    const entity = await this.repository.findOne({
      where: { sys_id } as unknown as FindOptionsWhere<E>,
    });
    if (!entity)
      throw new NotFoundException(
        `Record ${sys_id} not found in ${this.SN_TABLE}`,
      );

    Object.assign(entity, body);

    if (body.state !== undefined) {
      const mapped = mapIncomingState(this.SN_TABLE, body.state);
      if (mapped !== null) {
        const cols = entity as unknown as SnEntityColumns;
        cols.state = mapped;
        if (isClosingState(this.SN_TABLE, mapped) && !cols.resolved_at) {
          cols.resolved_at = new Date();
        }
      }
    }

    await this.repository.save(entity);
    return this.toRecord(entity);
  }
}
