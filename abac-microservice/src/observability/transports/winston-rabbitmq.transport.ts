import Transport = require('winston-transport');
import { MetricsProducerService } from '../services/metrics-producer.service';
import { OnModuleDestroy } from '@nestjs/common';

export interface LogInfo {
    timestamp: string;
    level: string;
    message: string;
    correlationId?: string;
    traceId?: string;
    spanId?: string;
    context?: string;
    stack?: any;
    [key: string]: any;
}

export type LogInfoLevel = 'info' | 'error' | 'warn' | 'debug';

export class WinstonRabbitMQTransport extends Transport implements OnModuleDestroy {
    private buffer: LogInfo[] = [];
    private readonly BATCH_SIZE = 50;
    private readonly FLUSH_INTERVAL_MS = 2000;
    private timer: NodeJS.Timeout;

    constructor(private readonly metricsService: MetricsProducerService) {
        super();
        this.timer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }

    log(info: LogInfo, callback: () => void) {
        const { level, message, timestamp, correlationId, traceId, spanId, context, ...rest } = info;

        this.buffer.push({ level, message, timestamp, correlationId, traceId, spanId, context, ...rest });

        if (this.buffer.length >= this.BATCH_SIZE) {
            this.flush();
        }

        callback();
    }

    private async flush() {
        if (this.buffer.length === 0) return;

        const batch = [...this.buffer];
        this.buffer = [];

        try {
            await Promise.all(batch.map((log) => this.metricsService.publishLog(log, log.level as LogInfoLevel)));
        } catch (err) {
            console.error('RabbitMQ log transport error', err);
        }
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
        this.flush();
    }
}
