import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface ResponseFormat<T> {
    success: boolean;
    data: T;
    message?: string;
    correlationId: string;
    timestamp: string;
}

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, ResponseFormat<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseFormat<T>> {
        const ctx = context.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest();
        const correlationId = request.headers['x-correlation-id'] || 'N/A';

        return next.handle().pipe(
            map((data) => ({
                success: response.statusCode < 400,
                data: data || null,
                message: this.getMessage(response.statusCode),
                correlationId,
                timestamp: new Date().toISOString(),
                ...(this.isPaginated(data) && {
                    pagination: {
                        page: data.page,
                        limit: data.limit,
                        total: data.total,
                        totalPages: data.totalPages,
                    },
                    data: data.data,
                }),
            })),
        );
    }

    private getMessage(statusCode: number): string {
        const messages = {
            200: 'Request successful',
            201: 'Resource created successfully',
            202: 'Request accepted for processing',
            204: 'Resource deleted successfully',
        };
        return messages[statusCode] || 'Request processed';
    }

    private isPaginated(data: any): boolean {
        return (
            data &&
            typeof data === 'object' &&
            'data' in data &&
            'page' in data &&
            'limit' in data &&
            'total' in data
        );
    }
}