import { Injectable } from '@nestjs/common';
import { MetricsProducerService } from '../../observability';

/**
 * Publica métricas de negocio del motor ABAC usando OTel vía MetricsProducerService_v2.
 *
 * Métricas generadas:
 *  - abac_decisions_total           (counter)   por resource, action, granted
 *  - abac_decision_duration_ms      (histogram) duración de canAccess()
 *  - abac_cache_hits_total          (counter)   por cacheType (app | permission | policy)
 *  - abac_cache_misses_total        (counter)   por cacheType
 *  - abac_policies_evaluated_total  (counter)   total de políticas evaluadas
 */
@Injectable()
export class AbacMetricsService {
    constructor(private readonly metrics: MetricsProducerService) { }

    /** Registra la decisión final de acceso y su duración. */
    recordAccessDecision(
        resource: string,
        action: string,
        granted: boolean,
        durationMs: number,
    ): void {
        const labels = { resource, action, granted: String(granted) };
        this.metrics.incrementCounter('abac_decisions_total', 1, labels);
        this.metrics.observeHistogram('abac_decision_duration_ms', durationMs, { resource, action });
    }

    /** Registra un hit de caché en la decisión final (granted). */
    recordCacheHit(): void {
        this.metrics.incrementCounter('abac_cache_hits_total', 1, { cache_type: 'granted' });
    }

    /** Registra un miss de caché en la decisión final (granted). */
    recordCacheMiss(): void {
        this.metrics.incrementCounter('abac_cache_misses_total', 1, { cache_type: 'granted' });
    }

    /** Registra cuántas políticas fueron evaluadas en una decisión. */
    recordPoliciesEvaluated(count: number): void {
        this.metrics.incrementCounter('abac_policies_evaluated_total', count);
    }
}
