import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SnowRequestService } from './snow-request.service';
import { SnowRequestQueueService } from './snow-request-queue.service';

/**
 * Worker que reemplaza los 28 loops TCP de polling al broker.
 *
 * Cada 500ms consulta la tabla snow_requests buscando registros QUEUED
 * ordenados por prioridad de tipo y nivel. Los marca como IN_PROGRESS
 * y los encola en la PQueue global para dispatch hacia ServiceNow.
 *
 * Si la cola está vacía, espera el intervalo. Si hay mensajes, re-consume
 * de inmediato (setImmediate) para vaciar la cola lo más rápido posible.
 *
 * Al arrancar, recupera registros IN_PROGRESS de más de 5 minutos
 * (proceso caído a mitad de vuelo) y los resetea a QUEUED.
 */
@Injectable()
export class SnowRequestWorkerService implements OnModuleInit {
  private readonly logger = new Logger(SnowRequestWorkerService.name);
  private readonly POLL_INTERVAL_MS = 500;
  private readonly BATCH_SIZE = 20;

  // Chequeo de expiración cada 30 segundos — no en cada poll para no sobrecargar la DB
  private readonly EXPIRE_CHECK_INTERVAL_MS = 30_000;
  private lastExpireCheck = 0;

  constructor(
    private readonly snowRequestService: SnowRequestService,
    private readonly queueService: SnowRequestQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.snowRequestService.recoverStuckProcessing();
    this.logger.log('Recuperación de IN_PROGRESS atascados completada');
    this.startWorker();
  }

  private startWorker(): void {
    const poll = async () => {
      try {
        await this.checkExpiry();

        // Backpressure: si la PQueue ya tiene MAX_BACKLOG tareas en size+pending,
        // no leer más filas QUEUED de la DB — sin este freno, una tormenta de
        // alertas mueve la tabla entera a memoria en segundos porque nada
        // detiene al worker mientras haya filas QUEUED (ver M-12 en la
        // auditoría de 2026-08-31).
        if (this.queueService.isBacklogFull()) {
          setTimeout(poll, this.POLL_INTERVAL_MS);
          return;
        }

        const entities = await this.snowRequestService.findPendingQueue(
          this.BATCH_SIZE,
        );

        if (entities.length > 0) {
          await this.snowRequestService.markAsProcessing(
            entities.map((e) => e.correlationId),
          );

          for (const entity of entities) {
            this.queueService.enqueue(entity);
          }

          setImmediate(poll);
        } else {
          setTimeout(poll, this.POLL_INTERVAL_MS);
        }
      } catch (error) {
        this.logger.warn(
          `Worker: error en poll — ${error?.message}. Reintentando en ${this.POLL_INTERVAL_MS}ms`,
        );
        setTimeout(poll, this.POLL_INTERVAL_MS);
      }
    };

    poll();
    this.logger.log(
      `Worker iniciado [batchSize=${this.BATCH_SIZE} interval=${this.POLL_INTERVAL_MS}ms]`,
    );
  }

  private async checkExpiry(): Promise<void> {
    const now = Date.now();
    if (now - this.lastExpireCheck < this.EXPIRE_CHECK_INTERVAL_MS) return;

    this.lastExpireCheck = now;
    const expired = await this.snowRequestService.expireOverdue();
    if (expired > 0) {
      this.logger.log(
        `TTL vencido: ${expired} alerta(s) de monitoreo expiradas sin enviarse a ServiceNow`,
      );
    }
  }
}
