import {
  Injectable,
  LoggerService as NestLoggerService,
  OnModuleDestroy,
} from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { CorrelationIdService } from './correlation-id.service';
import { WinstonHttpTransport } from '../transports/winston-http.transport';

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleDestroy {
  private readonly logger: Logger;
  private readonly httpTransport?: WinstonHttpTransport;

  constructor(private readonly correlationService: CorrelationIdService) {
    const logFormat = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      format.json({
        space: 2,
        replacer: (key, value) => {
          if (key === 'stack') return undefined;
          return value;
        },
      }),
    );

    const fileTransport = new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat,
    });

    this.httpTransport = process.env.LOG_TRANSPORT_URL
      ? new WinstonHttpTransport()
      : undefined;

    this.logger = createLogger({
      level: 'info',
      format: logFormat,
      transports: [
        fileTransport,
        ...(this.httpTransport ? [this.httpTransport] : []),
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.printf((info) => {
              const {
                timestamp,
                level,
                message,
                context,
                correlationId,
                stack,
                ...rest
              } = info;

              const cid =
                correlationId ?? this.correlationService.getCorrelationId();
              const cidPart = cid ? ` [${cid}]` : '';
              const ctx = context ? ` [${context}]` : '';
              const date = new Date(timestamp as string).toLocaleString(
                'es-ES',
                { hour12: true },
              );

              let line = `[Nest] ${process.pid}  - ${date}   ${level}${ctx}${cidPart} ${message}`;

              if (Object.keys(rest).length > 0) {
                line += ` ${JSON.stringify(rest)}`;
              }

              if (stack) {
                line += `\n${stack}`;
              }

              return line;
            }),
          ),
        }),
      ],
      exceptionHandlers: [
        fileTransport,
        new transports.Console({
          format: format.combine(format.colorize(), format.simple()),
        }),
      ],
      rejectionHandlers: [fileTransport],
    });
  }

  log(
    message: string,
    context: string = 'Application',
    meta?: Record<string, any>,
  ) {
    this.logger.info(message, { context, ...this.getCommonMeta(), ...meta });
  }

  error(
    message: string,
    trace: string,
    context: string = 'Application',
    meta?: Record<string, any>,
  ) {
    this.logger.error(message, {
      context,
      stack: trace,
      ...this.getCommonMeta(),
      ...meta,
    });
  }

  warn(
    message: string,
    context: string = 'Application',
    meta?: Record<string, any>,
  ) {
    this.logger.warn(message, { context, ...this.getCommonMeta(), ...meta });
  }

  debug(
    message: string,
    context: string = 'Application',
    meta?: Record<string, any>,
  ) {
    this.logger.debug(message, { context, ...this.getCommonMeta(), ...meta });
  }

  verbose(
    message: string,
    context: string = 'Application',
    meta?: Record<string, any>,
  ) {
    this.logger.verbose(message, { context, ...this.getCommonMeta(), ...meta });
  }

  onModuleDestroy(): void {
    this.httpTransport?.shutdown();
  }

  private getCommonMeta() {
    return {
      correlationId: this.correlationService.getCorrelationId(),
      traceId: this.correlationService.getTraceId(),
      spanId: this.correlationService.getSpanId(),
    };
  }
}
