import {
  Injectable,
  LoggerService as NestLoggerService,
  OnModuleDestroy,
} from '@nestjs/common';
import winston from 'winston';
import { winstonConfig } from './winston.config';
import { CorrelationIdService } from './correlation-id.service';
import { WinstonHttpTransport } from './winston-http.transport';

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleDestroy {
  private readonly logger: winston.Logger;
  private readonly httpTransport?: WinstonHttpTransport;

  constructor(private readonly correlationIdService: CorrelationIdService) {
    this.httpTransport = process.env.LOG_TRANSPORT_URL
      ? new WinstonHttpTransport()
      : undefined;

    const extraTransports = this.httpTransport ? [this.httpTransport] : [];

    this.logger = winston.createLogger({
      ...winstonConfig,
      transports: [
        ...((winstonConfig.transports as winston.transport[]) ?? []),
        ...extraTransports,
      ],
    });
  }

  onModuleDestroy(): void {
    this.httpTransport?.shutdown();
  }

  private meta(context?: string): Record<string, any> {
    return {
      context,
      service: process.env.SERVICE_NAME ?? 'integration-service',
      correlationId: this.correlationIdService.getCorrelationId(),
    };
  }

  info(message: string, context?: string, extra?: Record<string, any>) {
    this.logger.info(message, { ...this.meta(context), ...extra });
  }

  /** Alias requerido por la interfaz LoggerService de Nest (app.useLogger). */
  log(message: string, context?: string, extra?: Record<string, any>) {
    this.info(message, context, extra);
  }

  error(message: string, context?: string, extra?: Record<string, any>) {
    this.logger.error(message, { ...this.meta(context), ...extra });
  }

  warn(message: string, context?: string, extra?: Record<string, any>) {
    this.logger.warn(message, { ...this.meta(context), ...extra });
  }

  debug(message: string, context?: string, extra?: Record<string, any>) {
    this.logger.debug(message, { ...this.meta(context), ...extra });
  }

  verbose(message: string, context?: string, extra?: Record<string, any>) {
    this.logger.verbose(message, { ...this.meta(context), ...extra });
  }
}
