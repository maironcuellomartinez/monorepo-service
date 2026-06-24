import {
    Injectable,
    LoggerService as NestLoggerService,
    Inject,
    OnModuleDestroy,
} from '@nestjs/common';
import {
    createLogger,
    format,
    transports,
    Logger as WinstonLogger,
} from 'winston';
import * as util from 'util';

import { CorrelationIdService } from './correlation-id.service';
import { MetricsProducerService } from './metrics-producer.service';
import { WinstonHttpTransport } from '../transports/winston-http.transport';

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleDestroy {
    private readonly winston: WinstonLogger;
    private lastTs = performance.now();

    constructor(
        private readonly correlationId: CorrelationIdService,
        private readonly metrics: MetricsProducerService,
        private readonly httpTransport: WinstonHttpTransport,
        @Inject('SERVICE_NAME') private readonly serviceName: string,
    ) {

        /**
         * ===== JSON BASE (logs / http) =====
         */
        const jsonFormat = format.combine(
            format.timestamp(),
            format.errors({ stack: true }),
            format.json({
                replacer: (_k, v) => {
                    if (v instanceof Error) {
                        return {
                            name: v.name,
                            message: v.message,
                            stack: v.stack?.split('\n'),
                        };
                    }
                    return v;
                },
            }),
        );

        /**
         * ===== CONSOLE (dev legible) =====
         */
        const consoleFormat = format.printf(
            ({ timestamp, level, message, context, correlationId, ...meta }) => {
                const now = performance.now();
                const diff = Math.round(now - this.lastTs);
                this.lastTs = now;

                const cid = correlationId ?? this.correlationId.getCorrelationId();
                const ctx = context ? ` [${context}]` : '';
                const lvl = level.toUpperCase().padStart(5, ' ');
                const delta = diff > 0 ? ` +${diff}ms` : '';

                const date = new Date(timestamp as string).toLocaleString('es-ES', {
                    hour12: true,
                });

                let msg = message;
                if (typeof message === 'object') {
                    msg = util.inspect(message, {
                        colors: true,
                        depth: 4,
                        compact: false,
                    });
                }

                let details = '';
                if (meta?.stack) {
                    const stack = meta.stack as string | string[];
                    const lines = Array.isArray(stack) ? stack : stack.split('\n');
                    details =
                        '\n' +
                        lines.map((l: string) => '  ' + l).join('\n');
                } else if (Object.keys(meta).length > 0) {
                    details =
                        '\n' +
                        util.inspect(meta, {
                            colors: true,
                            depth: 4,
                            compact: false,
                        });
                }

                return `[Nest] ${process.pid}  - ${date}   ${lvl} ${ctx} [${cid}] ${msg}${delta}`;
            },
        );

        this.winston = createLogger({
            level: process.env.LOG_LEVEL ?? 'info',
            defaultMeta: { service: this.serviceName },
            transports: [
                new transports.Console({
                    format: format.combine(
                        format.label({ label: 'Nest' }),
                        format.colorize({ all: true }),
                        jsonFormat,
                        consoleFormat,
                    ),
                }),
                this.httpTransport,
            ],
        });
    }

    // ======================================================
    // NestJS LoggerService API
    // ======================================================

    log(message: any, context?: string): void {
        const ctx = context ?? 'Application';
        const cid = this.correlationId.getCorrelationId();

        this.winston.info(message, { context: ctx, correlationId: cid });

        // Metrica: solo labels de cardinalidad fija (sin message)
        this.metrics.recordLog('info', ctx);
    }

    error(message: any, trace?: string, context?: string, meta?: Record<string, any>): void {
        const ctx = context ?? 'Application';
        const cid = this.correlationId.getCorrelationId();

        this.winston.error(message, { context: ctx, correlationId: cid, stack: trace, ...meta });

        // Metrica de error
        this.metrics.recordError(ctx);
    }

    warn(message: any, context?: string, meta?: Record<string, any>): void {
        const ctx = context ?? 'Application';
        const cid = this.correlationId.getCorrelationId();

        this.winston.warn(message, { context: ctx, correlationId: cid, ...meta });

        // Metrica: warn counter
        this.metrics.recordLog('warn', ctx);
    }

    debug(message: any, context?: string, meta?: Record<string, any>): void {
        this.winston.debug(message, {
            context: context ?? 'Application',
            correlationId: this.correlationId.getCorrelationId(),
            ...meta,
        });

        // Debug no entra en metrics — seria ruido
    }

    verbose(message: any, context?: string, meta?: Record<string, any>): void {
        this.winston.verbose(message, {
            context: context ?? 'Application',
            correlationId: this.correlationId.getCorrelationId(),
            ...meta,
        });
    }

    // ======================================================
    // Domain helpers
    // ======================================================

    businessEvent(event: string, meta?: Record<string, any>): void {
        const cid = this.correlationId.getCorrelationId();

        this.winston.info(`Business event: ${event}`, {
            context: 'Business',
            event,
            correlationId: cid,
            ...meta,
        });

        this.metrics.recordBusinessEvent(event);
    }

    // ======================================================
    // Shutdown
    // ======================================================

    onModuleDestroy(): void {
        this.httpTransport.onModuleDestroy();
        this.winston.end();
    }
}
