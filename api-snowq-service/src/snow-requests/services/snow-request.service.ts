import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Between, In, LessThan, Repository } from 'typeorm';
import { SnowRequestEntity } from '../entities/snow-request.entity';
import { RequestPriorityUtils, STATUS } from 'src/common';
import { DlqFilterDto } from '../dto/dlq-filter.dto';
import { RequestType } from 'src/common/enum/request-type.enum';

@Injectable()
export class SnowRequestService {
    private readonly logger = new Logger(SnowRequestService.name);

    constructor(
        @InjectRepository(SnowRequestEntity)
        private readonly repo: Repository<SnowRequestEntity>,
    ) { }

    async create(data: Partial<SnowRequestEntity>): Promise<SnowRequestEntity> {
        const entity = this.repo.create(data);
        return this.repo.save(entity);
    }

    async findByCorrelationId(correlationId: string): Promise<SnowRequestEntity | null> {
        return this.repo.findOne({ where: { correlationId } });
    }

    /**
     * Devuelve TODOS los registros para el dashboard.
     */
    async findAll(): Promise<SnowRequestEntity[]> {
        return this.repo.find({
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    /**
     * Devuelve registros DELIVERED para el dashboard.
     */
    async findDelivered(): Promise<SnowRequestEntity[]> {
        return this.repo.find({
            where: { status: STATUS.DELIVERED },
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }

    /**
     * Devuelve registros QUEUED listos para procesar, ordenados por prioridad:
     *   incident (400) > change_request (300) > problem/sc_req_item (200) > resto (100)
     *   + offset por nivel numérico (CRITICAL=4 … LOW=1)
     * Solo devuelve registros cuyo nextRetryAt ya venció o es nulo.
     */
    async findPendingQueue(limit: number): Promise<SnowRequestEntity[]> {
        return this.repo.createQueryBuilder('r')
            .where('r.status = :status', { status: STATUS.QUEUED })
            .andWhere('(r.nextRetryAt IS NULL OR r.nextRetryAt <= :now)', { now: new Date() })
            .orderBy(`
                CASE r.type
                    WHEN 'incident'        THEN 400
                    WHEN 'change_request'  THEN 300
                    WHEN 'problem'         THEN 200
                    WHEN 'sc_req_item'     THEN 200
                    ELSE 100
                END + r.priority`, 'DESC')
            .addOrderBy('r.createdAt', 'ASC')
            .limit(limit)
            .getMany();
    }

    /**
     * Marca un lote de registros QUEUED como IN_PROGRESS para evitar doble procesamiento.
     * Usa condición WHERE status='QUEUED' para ser idempotente ante condición de carrera.
     */
    async markAsProcessing(correlationIds: string[]): Promise<void> {
        if (correlationIds.length === 0) return;
        await this.repo.update(
            { correlationId: In(correlationIds), status: STATUS.QUEUED },
            { status: STATUS.IN_PROGRESS },
        );
    }

    async markAsQueued(correlationId: string): Promise<void> {
        await this.repo.update({ correlationId }, { status: STATUS.QUEUED });
    }

    async markAsDelivered(correlationId: string, sysId: string, snowNumber: string): Promise<void> {
        await this.repo.update({ correlationId }, {
            status: STATUS.DELIVERED,
            sysId,
            snowNumber,
        });
    }

    /**
     * En caso de error al procesar:
     *  - Si retryCount + 1 < maxRetries(priority): vuelve a QUEUED con backoff exponencial + jitter
     *  - Si agota los reintentos: FAILED (equivalente a DLQ)
     *
     * retryAfterMs: si viene del header Retry-After de un 429, tiene precedencia
     * sobre el backoff calculado.
     */
    async markAsRetry(correlationId: string, error: string, retryAfterMs?: number): Promise<void> {
        const entity = await this.repo.findOne({ where: { correlationId } });
        if (!entity) return;

        const newRetryCount = entity.retryCount + 1;
        const maxRetries = RequestPriorityUtils.getMaxRetries(entity.priority);

        if (newRetryCount >= maxRetries) {
            await this.repo.update({ correlationId }, {
                status: STATUS.FAILED,
                retryCount: newRetryCount,
                lastError: error.substring(0, 500),
            });
        } else {
            const delayMs = retryAfterMs ?? RequestPriorityUtils.getRetryDelay(entity.priority, entity.retryCount);
            await this.repo.update({ correlationId }, {
                status: STATUS.QUEUED,
                retryCount: newRetryCount,
                nextRetryAt: new Date(Date.now() + delayMs),
                lastError: error.substring(0, 500),
            });
        }
    }

    async markAsFailed(correlationId: string, error?: string): Promise<void> {
        await this.repo.update({ correlationId }, {
            status: STATUS.FAILED,
            ...(error ? { lastError: error.substring(0, 500) } : {}),
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // DEDUPLICACIÓN Y CICLO DE VIDA DE MONITOREO
    // ─────────────────────────────────────────────────────────────────

    /**
     * Busca un registro activo para el fingerprint dado.
     *
     * Un registro es "activo" si:
     *   - está en QUEUED o IN_PROGRESS (todavía no llegó a SN), o
     *   - está en DELIVERED con resolvedAt IS NULL (ya está en SN y el host sigue caído)
     *
     * La inclusión de DELIVERED + resolvedAt IS NULL evita que las re-notificaciones
     * de Nagios (host sigue caído) generen tickets duplicados en SN mientras el
     * incidente original sigue abierto.
     */
    async findActiveByFingerprint(fingerprint: string): Promise<SnowRequestEntity | null> {
        return this.repo.createQueryBuilder('r')
            .where('r.fingerprint = :fingerprint', { fingerprint })
            .andWhere(new Brackets(qb => {
                qb.where('r.status IN (:...activeStatuses)', {
                    activeStatuses: [STATUS.QUEUED, STATUS.IN_PROGRESS],
                }).orWhere('r.status = :processed AND r.resolvedAt IS NULL', {
                    processed: STATUS.DELIVERED,
                });
            }))
            .orderBy('r.createdAt', 'DESC')
            .getOne();
    }

    /**
     * Procesa una notificación de recovery para el fingerprint dado.
     * Evalúa el estado actual del registro y actúa en consecuencia:
     *
     *   QUEUED      → STATUS = CANCELLED   (nunca llegará a SN)
     *   IN_PROGRESS → acción = TOO_LATE    (ya se está enviando, no se puede cancelar)
     *   DELIVERED + resolvedAt IS NULL
     *               → resolvedAt = now     (cierra el ciclo; el ticket en SN debe cerrarse)
     *               → acción = RESOLVED    (devuelve sysId para que Thruk cierre el ticket en SN)
     *   sin registro activo → null         (idempotente)
     */
    async cancelByFingerprint(
        fingerprint: string,
    ): Promise<{ action: 'CANCELLED' | 'TOO_LATE' | 'RESOLVED'; entity: SnowRequestEntity } | null> {
        // 1. QUEUED → cancelar
        const queued = await this.repo.findOne({ where: { fingerprint, status: STATUS.QUEUED } });
        if (queued) {
            await this.repo.update({ correlationId: queued.correlationId }, { status: STATUS.CANCELLED });
            return { action: 'CANCELLED', entity: { ...queued, status: STATUS.CANCELLED } };
        }

        // 2. IN_PROGRESS → demasiado tarde
        const inProgress = await this.repo.findOne({ where: { fingerprint, status: STATUS.IN_PROGRESS } });
        if (inProgress) {
            return { action: 'TOO_LATE', entity: inProgress };
        }

        // 3. DELIVERED sin resolvedAt → marcar como resuelto
        const processed = await this.repo.createQueryBuilder('r')
            .where('r.fingerprint = :fingerprint', { fingerprint })
            .andWhere('r.status = :status', { status: STATUS.DELIVERED })
            .andWhere('r.resolvedAt IS NULL')
            .orderBy('r.createdAt', 'DESC')
            .getOne();

        if (processed) {
            const resolvedAt = new Date();
            await this.repo.update({ correlationId: processed.correlationId }, { resolvedAt });
            return { action: 'RESOLVED', entity: { ...processed, resolvedAt } };
        }

        // Diagnóstico: qué tickets existen con este fingerprint
        const all = await this.repo.find({ where: { fingerprint } });
        this.logger.debug(
            `[CANCELBYFINGERPRINT] fingerprint=${fingerprint.substring(0, 12)}... — ${all.length} ticket(s) encontrado(s): ` +
            all.map(t => `[${t.internalNumber} status=${t.status} resolvedAt=${t.resolvedAt ?? 'NULL'}]`).join(', '),
        );

        return null;
    }

    /**
     * Devuelve tickets DELIVERED con sysId presente y resolvedAt NULL.
     * Son los candidatos a reconciliar contra SN.
     */
    async findProcessedUnresolved(limit = 20): Promise<SnowRequestEntity[]> {
        return this.repo.createQueryBuilder('r')
            .where('r.status = :status', { status: STATUS.DELIVERED })
            .andWhere('r.sysId IS NOT NULL')
            .andWhere('r.resolvedAt IS NULL')
            .orderBy('r.updatedAt', 'ASC')
            .limit(limit)
            .getMany();
    }

    /**
     * Registra la fecha de resolución de un ticket ya procesado.
     */
    async markAsResolvedAt(correlationId: string, resolvedAt: Date): Promise<void> {
        await this.repo.update({ correlationId }, { resolvedAt });
    }

    /**
     * Marca como EXPIRED todos los registros QUEUED cuyo TTL ya venció.
     * Solo afecta registros con expiresAt NOT NULL.
     * Devuelve la cantidad de registros expirados.
     */
    async expireOverdue(): Promise<number> {
        const result = await this.repo.createQueryBuilder()
            .update(SnowRequestEntity)
            .set({ status: STATUS.EXPIRED })
            .where('status = :status', { status: STATUS.QUEUED })
            .andWhere('expiresAt IS NOT NULL')
            .andWhere('expiresAt < :now', { now: new Date() })
            .execute();
        return result.affected ?? 0;
    }

    /**
     * Devuelve todos los registros en estado FAILED (DLQ lógica),
     * ordenados del más reciente al más antiguo.
     */
    async findFailed(): Promise<SnowRequestEntity[]> {
        return this.repo.find({
            where: { status: STATUS.FAILED },
            order: { updatedAt: 'DESC' },
        });
    }

    /**
     * Reencola un registro FAILED: resetea retryCount a 0,
     * limpia nextRetryAt y lastError, y vuelve a QUEUED.
     * Retorna null si no existe o no está en FAILED.
     */
    async retryFailed(correlationId: string): Promise<SnowRequestEntity | null> {
        const entity = await this.repo.findOne({ where: { correlationId, status: STATUS.FAILED } });
        if (!entity) return null;

        await this.repo.update({ correlationId }, {
            status: STATUS.QUEUED,
            retryCount: 0,
            nextRetryAt: null,
            lastError: null,
        });

        return this.repo.findOne({ where: { correlationId } });
    }

    /**
     * Reencola todos los registros FAILED de una vez.
     * Devuelve cuántos registros se reactivaron.
     */
    async retryAllFailed(): Promise<number> {
        const result = await this.repo.update(
            { status: STATUS.FAILED },
            { status: STATUS.QUEUED, retryCount: 0, nextRetryAt: null, lastError: null },
        );
        return result.affected ?? 0;
    }

    /**
     * Recuperación al arrancar: registros IN_PROGRESS de más de 5 minutos
     * (proceso caído a mitad de vuelo) se resetean a QUEUED para reintentarse.
     */
    async recoverStuckProcessing(): Promise<void> {
        const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000);
        await this.repo.update(
            { status: STATUS.IN_PROGRESS, updatedAt: LessThan(stuckThreshold) },
            { status: STATUS.QUEUED },
        );
    }

    // ─────────────────────────────────────────────────────────────────
    // DLQ — OPERACIONES MANUALES
    // ─────────────────────────────────────────────────────────────────

    /**
     * Reencola registros FAILED que cumplan el filtro.
     * Criterios opcionales (AND): type, source, rango updatedAt (since/until).
     * Devuelve cuántos registros se reactivaron.
     */
    async retryFiltered(filter: DlqFilterDto): Promise<number> {
        const qb = this.repo.createQueryBuilder()
            .update(SnowRequestEntity)
            .set({ status: STATUS.QUEUED, retryCount: 0, nextRetryAt: null, lastError: null })
            .where('status = :status', { status: STATUS.FAILED });

        if (filter.type)  qb.andWhere('type = :type',     { type: filter.type });
        if (filter.source) qb.andWhere('source = :source', { source: filter.source });
        if (filter.since)  qb.andWhere('updatedAt >= :since', { since: new Date(filter.since) });
        if (filter.until)  qb.andWhere('updatedAt <= :until', { until: new Date(filter.until) });

        const result = await qb.execute();
        return result.affected ?? 0;
    }

    /**
     * Descarta un registro FAILED individual: lo marca como DISCARDED
     * para que no sea reintentado ni aparezca en métricas activas.
     * Retorna null si no existe o no está en FAILED.
     */
    async discardFailed(correlationId: string): Promise<SnowRequestEntity | null> {
        const entity = await this.repo.findOne({ where: { correlationId, status: STATUS.FAILED } });
        if (!entity) return null;

        await this.repo.update({ correlationId }, { status: STATUS.DISCARDED });
        return { ...entity, status: STATUS.DISCARDED };
    }

    /**
     * Descarta en lote registros FAILED que cumplan el filtro.
     * Devuelve cuántos registros se descartaron.
     */
    async discardFiltered(filter: DlqFilterDto): Promise<number> {
        const qb = this.repo.createQueryBuilder()
            .update(SnowRequestEntity)
            .set({ status: STATUS.DISCARDED })
            .where('status = :status', { status: STATUS.FAILED });

        if (filter.type)   qb.andWhere('type = :type',        { type: filter.type });
        if (filter.source) qb.andWhere('source = :source',    { source: filter.source });
        if (filter.since)  qb.andWhere('updatedAt >= :since', { since: new Date(filter.since) });
        if (filter.until)  qb.andWhere('updatedAt <= :until', { until: new Date(filter.until) });

        const result = await qb.execute();
        return result.affected ?? 0;
    }

    /**
     * Estadísticas de la DLQ.
     *
     * Devuelve:
     *  - total: total de registros FAILED activos
     *  - byType: desglose por tipo de solicitud
     *  - byPriority: desglose por nivel de prioridad
     *  - byErrorPattern: top 10 mensajes de error más frecuentes
     *  - oldest: fecha del registro FAILED más antiguo
     *  - newest: fecha del registro FAILED más reciente
     */
    async getDlqStats(): Promise<{
        total: number;
        byType: Record<string, number>;
        byPriority: Record<string, number>;
        byErrorPattern: Array<{ error: string; count: number }>;
        oldest: Date | null;
        newest: Date | null;
    }> {
        const failed = await this.repo.find({ where: { status: STATUS.FAILED } });

        if (failed.length === 0) {
            return { total: 0, byType: {}, byPriority: {}, byErrorPattern: [], oldest: null, newest: null };
        }

        const byType: Record<string, number> = {};
        const byPriority: Record<string, number> = {};
        const errorCounts: Record<string, number> = {};

        for (const r of failed) {
            byType[r.type] = (byType[r.type] ?? 0) + 1;

            const priorityLabel = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][r.priority] ?? String(r.priority);
            byPriority[priorityLabel] = (byPriority[priorityLabel] ?? 0) + 1;

            if (r.lastError) {
                // Normaliza el mensaje: recorta a 80 chars para agrupar variantes similares
                const key = r.lastError.substring(0, 80);
                errorCounts[key] = (errorCounts[key] ?? 0) + 1;
            }
        }

        const byErrorPattern = Object.entries(errorCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([error, count]) => ({ error, count }));

        const dates = failed.map(r => r.updatedAt.getTime());

        return {
            total: failed.length,
            byType,
            byPriority,
            byErrorPattern,
            oldest: new Date(Math.min(...dates)),
            newest: new Date(Math.max(...dates)),
        };
    }
}
