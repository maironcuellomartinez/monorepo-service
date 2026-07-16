import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { describeError } from '../utils/error.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, body, query, params, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const correlationId =
      headers['x-correlation-id'] || this.generateCorrelationId();
    const ip = headers['x-forwarded-for'] || request.ip || '';

    // Agregar correlationId a la request
    request.headers['x-correlation-id'] = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const startTime = Date.now();

    // Log de la request
    this.logger.log({
      message: 'Request received',
      correlationId,
      method,
      url,
      query,
      params,
      body: this.sanitizeBody(body),
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;

          // Log de la response exitosa
          this.logger.log({
            message: 'Request completed',
            correlationId,
            method,
            url,
            statusCode: response.statusCode,
            duration: `${duration}ms`,
            responseSize: this.calculateResponseSize(data),
            timestamp: new Date().toISOString(),
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;

          // Log de la response con error
          this.logger.error({
            message: 'Request failed',
            correlationId,
            method,
            url,
            statusCode: error.status || 500,
            duration: `${duration}ms`,
            error: describeError(error),
            errorName: error.name,
            timestamp: new Date().toISOString(),
          });
        },
      }),
    );
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;

    const sanitized = { ...body };

    // Eliminar campos sensibles
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'creditCard',
      'ssn',
      'cvv',
    ];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });

    return sanitized;
  }

  private calculateResponseSize(data: any): string {
    if (!data) return '0B';

    try {
      const jsonString = JSON.stringify(data);
      const bytes = Buffer.byteLength(jsonString, 'utf8');

      if (bytes < 1024) return `${bytes}B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)}KB`;
      return `${(bytes / 1048576).toFixed(2)}MB`;
    } catch {
      return 'N/A';
    }
  }
}
