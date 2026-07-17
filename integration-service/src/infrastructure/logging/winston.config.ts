// src/infrastructure/logging/winston.config.ts
import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import * as DailyRotateFileModule from 'winston-daily-rotate-file';
const DailyRotateFile =
  (DailyRotateFileModule as any).default ?? DailyRotateFileModule;

export const winstonConfig: WinstonModuleOptions = {
  levels: winston.config.syslog.levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  transports: [
    // Console transport — una sola linea por log, mismo formato que el
    // resto del ecosistema (@app/observability en monolith/api-gateway,
    // logger-winston.service.ts en api-snowq-service). El stack/meta extra
    // (incluido "service") no se imprime en consola pero si viaja completo
    // a observability-service via WinstonHttpTransport.
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf((info) => {
          const { timestamp, level, message, context, correlationId } = info;
          const cidPart = correlationId ? ` [${correlationId}]` : '';
          const ctx = context ? ` [${context}]` : '';
          const date = new Date(timestamp as string).toLocaleString('es-ES', {
            hour12: true,
          });

          return `[Nest] ${process.pid}  - ${date}   ${level}${ctx}${cidPart} ${message}`;
        }),
      ),
    }),

    // Daily rotate file for errors
    new DailyRotateFile({
      level: 'error',
      dirname: 'logs',
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),

    // Daily rotate file for all logs
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],

  // Opciones adicionales
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],

  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
};
