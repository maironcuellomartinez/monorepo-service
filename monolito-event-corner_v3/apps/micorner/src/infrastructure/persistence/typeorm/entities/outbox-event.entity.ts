import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Entidad que representa un evento en la tabla outbox_events.
 * Esta tabla se utiliza para almacenar eventos que deben ser publicados a otros módulos.
 */
@Entity('outbox_events')
export class OutboxEventEntity {
    @PrimaryColumn({ type: 'varchar', length: 36 })
    event_id: string;

    @Column({ length: 100 })
    event_type: string;

    @Column({ length: 50 })
    aggregate_id: string;

    @Column({ type: 'json' })
    payload: object;

    @Column({ type: 'timestamp', nullable: true })
    published_at: Date | null;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    /** Número de intentos de procesamiento realizados. */
    @Column({ type: 'int', default: 0 })
    retry_count: number;

    /** Máximo de reintentos antes de mover a fallidos. */
    @Column({ type: 'int', default: 5 })
    max_retries: number;

    /** Último mensaje de error capturado. */
    @Column({ type: 'text', nullable: true })
    last_error: string | null;

    /** Fecha mínima para el próximo reintento (backoff exponencial). */
    @Column({ type: 'timestamp', nullable: true })
    retry_after: Date | null;

    /** Fecha en la que el evento fue marcado como fallido definitivamente. */
    @Column({ type: 'timestamp', nullable: true })
    failed_at: Date | null;
}
