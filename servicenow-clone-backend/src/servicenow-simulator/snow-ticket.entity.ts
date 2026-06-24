import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sn_tickets')
export class SnowTicketEntity {
  /** sys_id generado por el simulador (32 hex chars, sin guiones) */
  @PrimaryColumn({ type: 'varchar', length: 32 })
  sys_id: string;

  /** Número legible: INC0000001, CHG0000001, etc. */
  @Column({ type: 'varchar', length: 30, unique: true })
  number: string;

  /** Tabla de ServiceNow: incident, change_request, sc_req_item, etc. */
  @Column({ type: 'varchar', length: 60 })
  table_name: string;

  /**
   * Estado del ticket en el simulador.
   * open     → ticket activo (problema en curso)
   * resolved → resuelto vía recovery
   * closed   → cerrado manualmente
   */
  @Column({ type: 'varchar', length: 20, default: 'open' })
  state: string;

  /** Todos los campos enviados por api-snowq-service */
  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  /** Fecha en que se resolvió/cerró — null mientras sigue abierto */
  @Column({ type: 'datetime', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
