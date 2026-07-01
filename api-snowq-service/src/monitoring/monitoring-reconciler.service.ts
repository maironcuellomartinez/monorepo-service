import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SnowRequestService } from 'src/snow-requests/services/snow-request.service';
import { ServiceNowClientService } from 'src/servicenow/client/servicenow-client.service';
import { TracingClient } from '../common/tracing.client';

/**
 * Option A — Reconciler job.
 *
 * Consulta periódicamente ServiceNow en busca de tickets DELIVERED
 * cerrados directamente allá (sin Recovery de Nagios) y marca resolvedAt.
 *
 * Variables de entorno:
 *   RECONCILER_ENABLED            true | false   (default: false)
 *   RECONCILER_INTERVAL_SECONDS   entero > 0     (default: 300)
 *   RECONCILER_BATCH_SIZE         entero > 0     (default: 20)
 *
 * IMPORTANTE — costos de API:
 *   Cada pasada hace como máximo RECONCILER_BATCH_SIZE llamadas GET a SN.
 *   Con el default (batch=20, interval=300 s) son ≤ 20 req cada 5 minutos,
 *   ~5.760 req/día en el peor caso (todos los tickets abiertos siempre).
 *   En un escenario real donde la mayoría se cierran rápido, la cifra es mucho menor.
 */
@Injectable()
export class MonitoringReconcilerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MonitoringReconcilerService.name);
    private timer: NodeJS.Timeout | null = null;
    private running = false;   // evita solapamiento de pasadas

    constructor(
        private readonly snowRequestService: SnowRequestService,
        private readonly snowClient: ServiceNowClientService,
    ) { }

    onModuleInit() {
        const enabled = process.env.RECONCILER_ENABLED === 'true';

        if (!enabled) {
            this.logger.log('Reconciler deshabilitado (RECONCILER_ENABLED=false)');
            return;
        }

        const intervalSeconds = Math.max(30, parseInt(process.env.RECONCILER_INTERVAL_SECONDS ?? '300', 10));
        const batchSize = Math.max(1, parseInt(process.env.RECONCILER_BATCH_SIZE ?? '20', 10));

        this.logger.log(
            `Reconciler activo — intervalo=${intervalSeconds}s  batch=${batchSize} req/pasada`,
        );

        this.timer = setInterval(() => this.runSafe(batchSize), intervalSeconds * 1000);
    }

    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.logger.log('Reconciler detenido');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    private async runSafe(batchSize: number): Promise<void> {
        if (this.running) {
            this.logger.warn('[Reconciler] Pasada anterior aún en curso — saltando ciclo');
            return;
        }
        this.running = true;
        try {
            await this.reconcile(batchSize);
        } catch (err: any) {
            this.logger.error(`[Reconciler] Error inesperado: ${err?.message}`);
        } finally {
            this.running = false;
        }
    }

    /**
     * Ejecuta una pasada del reconciler:
     *   1. Obtiene hasta BATCH_SIZE tickets DELIVERED con resolvedAt = NULL
     *   2. Por cada uno, consulta el estado en SN (1 GET por ticket)
     *   3. Si está cerrado, registra resolvedAt localmente
     *  @example
     *  const result = await this.reconcile(20);
     *  console.log(result); // { checked: 10, resolved: 5 }
     *  @param batchSize - Número de tickets a procesar por pasada
     *  @returns Objeto con el número de tickets revisados y resueltos
     */
    async reconcile(batchSize = 20): Promise<{ checked: number; resolved: number }> {
        return TracingClient.getInstance().run(
            'snowq.service.monitoringReconciler.reconcile',
            { kind: 'internal' },
            () => this._reconcile(batchSize),
        );
    }

    private async _reconcile(batchSize = 20): Promise<{ checked: number; resolved: number }> {
        const tickets = await this.snowRequestService.findProcessedUnresolved(batchSize);

        if (tickets.length === 0) {
            this.logger.debug('[Reconciler] Sin tickets pendientes de reconciliar.');
            return { checked: 0, resolved: 0 };
        }

        this.logger.log(`[Reconciler] Consultando ${tickets.length} ticket(s) en SN...`);

        let resolved = 0;

        for (const ticket of tickets) {
            try {
                const snState = await this.snowClient.getTicketState(ticket.type, ticket.sysId!);

                if (snState === null) {
                    this.logger.warn(
                        `[Reconciler] sysId=${ticket.sysId} no encontrado en SN — puede haberse eliminado`,
                    );
                    continue;
                }

                if (snState.closed) {
                    await this.snowRequestService.markAsResolvedAt(ticket.correlationId, new Date());
                    this.logger.log(
                        `[Reconciler] RESOLVED correlationId=${ticket.correlationId} snowNumber=${ticket.snowNumber} state=${snState.state}`,
                    );
                    resolved++;
                } else {
                    this.logger.debug(
                        `[Reconciler] Abierto correlationId=${ticket.correlationId} state=${snState.state}`,
                    );
                }
            } catch (err: any) {
                this.logger.error(`[Reconciler] Error consultando sysId=${ticket.sysId}: ${err?.message}`);
            }
        }

        this.logger.log(`[Reconciler] Pasada completada — checked=${tickets.length} resolved=${resolved}`);
        return { checked: tickets.length, resolved };
    }
}
