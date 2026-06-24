// src/infrastructure/logging/winston.config.ts
import { WinstonModuleOptions, utilities } from 'nest-winston';
import * as winston from 'winston';
import * as DailyRotateFileModule from 'winston-daily-rotate-file';
const DailyRotateFile = (DailyRotateFileModule as any).default ?? DailyRotateFileModule;

export const winstonConfig: WinstonModuleOptions = {
    levels: winston.config.syslog.levels,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
    ),
    transports: [
        // Console transport
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.ms(),
                utilities.format.nestLike('IntegrationService', {
                    colors: true,
                    prettyPrint: true,
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