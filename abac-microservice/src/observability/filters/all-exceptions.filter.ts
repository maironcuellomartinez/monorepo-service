import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { context, trace } from '@opentelemetry/api';
import { CorrelationIdService } from '../services/correlation-id.service';
import { LoggerService } from '../services/logger.service';

export interface ErrorResponse {
    statusCode: number;
    timestamp: string;
    correlationId: string;
    path: string;
    method: string;
    message: string;
    details?: any;
    stack?: string[];
}

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    constructor(
        private readonly correlation: CorrelationIdService,
        private readonly loggerService: LoggerService,
    ) { }

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        const correlationId =
            this.correlation.getCorrelationId() ||
            (request.headers['x-correlation-id'] as string) ||
            `err-${randomUUID()}`;

        const statusCode = this.resolveStatusCode(exception);
        const message = this.resolveMessage(exception, statusCode);

        const errorResponse: ErrorResponse = {
            statusCode,
            timestamp: new Date().toISOString(),
            correlationId,
            path: request.url,
            method: request.method,
            message,
        };

        if (process.env.NODE_ENV === 'development') {
            errorResponse.details = this.resolveDetails(exception);
            if ((exception as any)?.stack) {
                errorResponse.stack = String((exception as any).stack)
                    .split('\n')
                    .map(line => line.trim());
            }
        }

        this.annotateActiveSpan(exception, statusCode);
        this.logException(exception, request, statusCode, errorResponse);

        response.status(statusCode).json(errorResponse);
    }

    private resolveStatusCode(exception: unknown): number {
        if (exception instanceof HttpException) {
            return exception.getStatus();
        }

        const errorMap: Record<string, number> = {
            ER_LOCK_WAIT_TIMEOUT: HttpStatus.REQUEST_TIMEOUT,
            ECONNREFUSED: HttpStatus.SERVICE_UNAVAILABLE,
            ER_DB_CONN_ERROR: HttpStatus.SERVICE_UNAVAILABLE,
            ETIMEDOUT: HttpStatus.SERVICE_UNAVAILABLE,
            ENOTFOUND: HttpStatus.SERVICE_UNAVAILABLE,
            ECONNRESET: HttpStatus.SERVICE_UNAVAILABLE,
            EPIPE: HttpStatus.SERVICE_UNAVAILABLE,
            ER_DUP_ENTRY: HttpStatus.CONFLICT,
            ER_NO_REFERENCED_ROW: HttpStatus.BAD_REQUEST,
            ER_NO_REFERENCED_ROW_2: HttpStatus.BAD_REQUEST,
            ER_ROW_IS_REFERENCED_2: HttpStatus.CONFLICT,
            EntityNotFoundError: HttpStatus.NOT_FOUND,
            ValidationError: HttpStatus.BAD_REQUEST,
            BusinessError: HttpStatus.UNPROCESSABLE_ENTITY,
            UnauthorizedError: HttpStatus.UNAUTHORIZED,
            JsonWebTokenError: HttpStatus.UNAUTHORIZED,
            TokenExpiredError: HttpStatus.UNAUTHORIZED,
        };

        // Prioridad: code (driver MySQL) → constructor.name (TypeORM: QueryFailedError, EntityNotFoundError) → name
        const key =
            (exception as any)?.code ||
            (exception as any)?.constructor?.name ||
            (exception as any)?.name;

        return errorMap[key] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private resolveMessage(exception: unknown, status: number): string {
        if (process.env.NODE_ENV === 'production' && status >= 500) {
            const generic: Record<number, string> = {
                [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal server error',
                [HttpStatus.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
                [HttpStatus.REQUEST_TIMEOUT]: 'Request timeout',
            };
            return generic[status] ?? 'An error occurred';
        }

        if ((exception as any)?.message) {
            return String((exception as any).message);
        }

        if (exception instanceof HttpException) {
            const res = exception.getResponse();
            return typeof res === 'string' ? res : ((res as any)?.message ?? 'Http error');
        }

        return 'Unknown error';
    }

    private resolveDetails(exception: unknown): any {
        if (exception instanceof HttpException) {
            const response = exception.getResponse();
            return typeof response === 'object' ? response : { message: response };
        }

        if ((exception as any)?.code && (exception as any)?.errno) {
            // No se expone `sql` (texto completo de la query): puede revelar estructura de
            // tablas/columnas y valores literales aunque solo se muestre en NODE_ENV=development.
            return {
                code: (exception as any).code,
                errno: (exception as any).errno,
                sqlMessage: (exception as any).sqlMessage,
            };
        }

        if (Array.isArray((exception as any)?.response?.message)) {
            return { validationErrors: (exception as any).response.message };
        }

        return { raw: String(exception) };
    }

    private annotateActiveSpan(exception: unknown, status: number): void {
        const span = trace.getSpan(context.active());
        if (!span) return;

        span.recordException(exception as Error);
        span.setAttribute('error.type', (exception as any)?.name ?? 'UnknownError');
        span.setAttribute('http.status_code', status);

        if (status >= 500) {
            span.setStatus({ code: 2 }); // SpanStatusCode.ERROR
        }
    }

    private logException(
        exception: unknown,
        request: Request,
        status: number,
        error: ErrorResponse,
    ): void {
        const isServerError = status >= 500;
        const ctx = (exception as any)?.constructor?.name ?? 'AllExceptionsFilter';

        const logPayload = {
            method: request.method,
            path: request.url,
            ip: request.ip,
            userAgent: request.get('user-agent'),
            statusCode: status,
            correlationId: error.correlationId,
            traceId: this.correlation.getTraceId(),
            spanId: this.correlation.getSpanId(),
            errorType: (exception as any)?.name,
            errorMessage: (exception as any)?.message,
        };

        if (isServerError) {
            this.loggerService.error(
                `SERVER ERROR ${request.method} ${request.url}`,
                (exception as any)?.stack,
                ctx,
                logPayload,
            );
        } else {
            this.loggerService.warn(
                `CLIENT ERROR ${request.method} ${request.url}`,
                ctx,
                logPayload,
            );
        }

        this.logger.error(
            `[${error.correlationId}] ${String((exception as any)?.message)}`,
            (exception as any)?.stack,
        );
    }
}
