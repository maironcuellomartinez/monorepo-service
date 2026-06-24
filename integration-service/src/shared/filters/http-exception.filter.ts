import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const correlationId = request.headers['x-correlation-id'] || 'N/A';

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let errorCode = 'INTERNAL_ERROR';
        let validationErrors: any[] = [];

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object') {
                message = (exceptionResponse as any).message || message;
                errorCode = (exceptionResponse as any).errorCode || errorCode;
                validationErrors = (exceptionResponse as any).errors || [];
            }
        } else if (exception instanceof QueryFailedError) {
            status = HttpStatus.BAD_REQUEST;
            message = 'Database query failed';
            errorCode = 'DATABASE_ERROR';

            // Log detallado del error de base de datos
            this.logger.error('Database query failed', {
                correlationId,
                driverError: exception.driverError?.code ?? exception.driverError,
            });
        } else if (exception instanceof Error) {
            message = exception.message;

            // Clasificación de errores comunes
            if (exception.name === 'ValidationError') {
                status = HttpStatus.BAD_REQUEST;
                errorCode = 'VALIDATION_ERROR';
            } else if (exception.name === 'UnauthorizedError') {
                status = HttpStatus.UNAUTHORIZED;
                errorCode = 'UNAUTHORIZED';
            } else if (exception.name === 'ForbiddenError') {
                status = HttpStatus.FORBIDDEN;
                errorCode = 'FORBIDDEN';
            }
        }

        // Log del error
        this.logger.error(`HTTP ${status} - ${message}`, {
            correlationId,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            error: exception instanceof Error ? {
                name: exception.name,
                message: exception.message,
                stack: exception.stack,
            } : exception,
        });

        // Construir respuesta
        const errorResponse = {
            statusCode: status,
            message,
            errorCode,
            correlationId,
            timestamp: new Date().toISOString(),
            path: request.url,
            ...(validationErrors.length > 0 && { errors: validationErrors }),
            ...(process.env.NODE_ENV === 'development' && {
                stack: exception instanceof Error ? exception.stack : undefined,
            }),
        };

        response.status(status).json(errorResponse);
    }
}