import { RequestType, STATUS } from 'src/common';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Index(['status', 'nextRetryAt'])   // worker poll: WHERE status=QUEUED AND nextRetryAt <= now
@Index(['fingerprint', 'status'])   // monitoring dedup: findActiveByFingerprint
@Index(['status', 'updatedAt'])     // DLQ queries, bulk filter ops
@Index(['status', 'expiresAt'])     // TTL expiry check cada 30s
@Entity('snow_requests')
export class SnowRequestEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    correlationId: string;

    @Column({ unique: true })
    internalNumber: string; // SNQ-XXXXXXXX

    @Column({ nullable: true })
    description?: string;

    @Column({ nullable: true })
    short_description?: string;

    @Column({ type: 'enum', enum: RequestType })
    type: RequestType;

    @Column({ type: 'int' })
    priority: number;

    @Column({ type: 'json' })
    payload: Record<string, any>;

    @Column({ nullable: true })
    sysId?: string;

    @Column({ nullable: true })
    snowNumber?: string; // número de ticket en ServiceNow

    @Column({ type: 'enum', enum: STATUS })
    status: STATUS;

    @Column()
    source: string;

    @Column({ default: false })
    immediate: boolean;

    /**
     * Clave de deduplicación (opcional).
     * Usada por el flujo de monitoreo (Nagios/Thruk) para evitar tickets duplicados
     * ante tormentas de alertas del mismo host/servicio.
     * Ejemplo: "host=web01;service=HTTP"
     */
    @Column({ nullable: true, type: 'varchar', length: 512 })
    fingerprint: string | null;

    /**
     * Fecha de expiración (opcional, TTL).
     * Si el registro sigue QUEUED cuando el worker lo evalúa y ya venció,
     * se descarta como EXPIRED sin enviarse a ServiceNow.
     * Útil para falsos positivos: la alerta entra a la cola pero el servicio
     * se recupera antes de que llegue a SN.
     */
    @Column({ nullable: true, type: 'datetime' })
    expiresAt: Date | null;

    @Column({ default: 0 })
    retryCount: number;

    @Column({ default: 10 })
    maxRetries: number;

    @Column({ nullable: true, type: 'datetime' })
    nextRetryAt: Date | null;

    @Column({ nullable: true, type: 'text' })
    lastError: string | null;

    /**
     * Fecha en que el ticket fue resuelto en ServiceNow (recovery de Nagios).
     * Solo aplica a registros DELIVERED con fingerprint.
     *
     * NULL  → ticket activo en SN (re-notificaciones del mismo host se deduplicarán)
     * NOT NULL → ticket cerrado — el fingerprint queda "libre" para nuevos incidentes
     *
     * Este campo distingue entre:
     *   - Re-notificación (host sigue caído)  → DELIVERED + resolvedAt IS NULL  → DEDUPLICATED
     *   - Nuevo incidente real (host recuperó y cayó de nuevo) → resolvedAt NOT NULL → nuevo ticket
     */
    @Column({ nullable: true, type: 'datetime' })
    resolvedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
