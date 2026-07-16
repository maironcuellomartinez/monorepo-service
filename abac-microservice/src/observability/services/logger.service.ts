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
import { MetricsProducerService, OBSERVABILITY_SERVICE_NAME } from './metrics-producer.service';
import { WinstonHttpTransport } from '../transports/winston-http.transport';

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleDestroy {
    private readonly winston: WinstonLogger;
    private readonly httpTransport: WinstonHttpTransport;
    private lastTs = performance.now();

    constructor(
        private readonly correlationId: CorrelationIdService,
        private readonly metrics: MetricsProducerService,
        @Inject(OBSERVABILITY_SERVICE_NAME) private readonly serviceName: string,
    ) {
        this.httpTransport = new WinstonHttpTransport();

        const LEVEL_COLORS: Record<string, string> = {
            error: '[31m',
            warn: '[33m',
            info: '[32m',
            debug: '[36m',
            verbose: '[35m',
        };
        const RESET = '[39m';

        const consoleFormat = format.printf(
            ({ timestamp, level, message, context, correlationId }) => {
                const now = performance.now();
                const diff = Math.round(now - this.lastTs);
                this.lastTs = now;

                const cid = correlationId ?? this.correlationId.getCorrelationId();
                const ctx = context ? ` [${context}]` : '';
                const cidPart = cid ? ` [${cid}]` : '';
                const color = LEVEL_COLORS[level] ?? '';
                const lvl = `${color}${level.toUpperCase().padStart(5, ' ')}${RESET}`;
                const delta = diff > 0 ? ` +${diff.toFixed(2)}ms` : '';

                const date = new Date(timestamp as string).toLocaleString('es-ES', { hour12: true });

                let msg = message;
                if (typeof message === 'object') {
                    msg = util.inspect(message, { colors: true, depth: 4, compact: false });
                }

                // El stack/meta extra no se imprime en consola (queda una sola linea por log);
                // igual se envia a observability-service porque WinstonHttpTransport lee
                // info.stack directo del objeto, sin depender de este formateador de consola.
                return `[Nest] ${process.pid}  - ${date}   ${lvl}${ctx}${cidPart} ${msg} ${delta}`;
            },
        );

        this.winston = createLogger({
            level: process.env.LOG_LEVEL ?? 'info',
            defaultMeta: { service: this.serviceName },
            transports: [
                new transports.Console({
                    format: format.combine(
                        format.label({ label: this.serviceName }),
                        format.timestamp(),
                        format.errors({ stack: true }),
                        consoleFormat,
                    ),
                }),
                this.httpTransport,
            ],
        });
    }

    log(message: any, context?: string, meta?: Record<string, any>) {
        this.winston.info(message, {
            context: context ?? 'Application',
            correlationId: this.correlationId.getCorrelationId(),
            ...meta,
        });
        this.metrics.incrementCounter('application_logs_total', 1, {
            context: context ?? 'Application',
            level: 'info',
            service: this.serviceName,
        });
    }

    error(message: any, trace?: string, context?: string, meta?: Record<string, any>) {
        this.winston.error(message, {
            context: context ?? 'Application',
            correlationId: this.correlationId.getCorrelationId(),
            stack: trace,
            ...meta,
        });
        this.metrics.incrementCounter('application_errors_total', 1, {
            context: context ?? 'Application',
        });
    }

    warn(message: any, context?: string, meta?: Record<string, any>) {
        this.winston.warn(message, {
            context: context ?? 'Application',
            correlationId: this.correlationId.getCorrelationId(),
            ...meta,
        });
    }

    debug(message: any, context?: string, meta?: Record<string, any>) {
        this.winston.debug(message, {
            context: context ?? 'Application',
            correlationId: this.correlationId.getCorrelationId(),
            ...meta,
        });
    }

    verbose(message: any, context?: string, meta?: Record<string, any>) {
        this.winston.verbose(message, {
            context: context ?? 'Application',
            correlationId: this.correlationId.getCorrelationId(),
            ...meta,
        });
    }

    businessEvent(event: string, meta?: Record<string, any>) {
        this.winston.info(`Business event: ${event}`, {
            context: 'Business',
            event,
            correlationId: this.correlationId.getCorrelationId(),
            ...meta,
        });
        this.metrics.incrementCounter('business_events_total', 1, { event });
    }

    onModuleDestroy() {
        this.httpTransport.shutdown();
        this.winston.end();
    }
}
