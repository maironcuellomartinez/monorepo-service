import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuditService, AuditAction } from '../services/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(
        private auditService: AuditService,
        private jwtService: JwtService,
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest<Request>();
        const httpResponse = context.switchToHttp().getResponse<{ statusCode: number }>();
        const startTime = Date.now();

        return next.handle().pipe(
            tap(async (response) => {
                const processingTime = Date.now() - startTime;

                try {
                    // Extraer usuario del token JWT
                    const user = this.extractUserFromRequest(request);

                    // Extraer información de la aplicación si está disponible
                    const applicationInfo = this.extractApplicationInfo(request);

                    // Registrar eventos de acceso ABAC
                    if (request.body && request.body.resource && request.body.action) {
                        await this.auditService.logAccessEvent(
                            true, // asumiendo éxito si llegamos aquí
                            {
                                userId: user?.id ?? 'system',
                                userEmail: user?.email ?? 'system',
                                applicationId: request.body.applicationId || applicationInfo?.id,
                                applicationName: applicationInfo?.name || 'Unknown',
                                resource: request.body.resource,
                                action: request.body.action,
                                context: request.body.context || {},
                                ipAddress: this.getClientIp(request),
                                userAgent: request.get('user-agent'),
                                processingTime,
                                correlationId: request.get('x-correlation-id'),
                            }
                        );
                    }

                    // Registrar otros eventos HTTP importantes
                    await this.logHttpEvent(request, httpResponse, processingTime, user);

                } catch (error) {
                    // Silenciar errores de auditoría para no afectar la respuesta principal
                    console.error('Error en AuditInterceptor:', (error as Error).message);
                }
            })
        );
    }

    private extractUserFromRequest(request: Request): { id: string; email: string } | null {
        try {
            // Intentar extraer de JWT token
            const authHeader = request.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const payload = this.jwtService.verify(token);
                return { id: payload.sub, email: payload.email };
            }

            // Intentar extraer de API Key (si está presente en el contexto)
            if (request['application']) {
                return {
                    id:    request['application'].id,
                    email: `[app] ${request['application'].name}`,
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    private extractApplicationInfo(request: Request): { id: string; name: string } | null {
        try {
            // Si la aplicación está attachada al request (por API Key strategy)
            if (request['application']) {
                return {
                    id: request['application'].id,
                    name: request['application'].name
                };
            }

            // Intentar extraer de headers o body
            const appId = request.get('x-application-id') || request.body?.applicationId;
            const appName = request.get('x-application-name') || request.body?.applicationName;

            if (appId) {
                return { id: appId, name: appName || 'Unknown' };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    private getClientIp(request: Request): string {
        return request.ip ||
            request.connection?.remoteAddress ||
            request.socket?.remoteAddress ||
            request.headers['x-forwarded-for'] as string ||
            'unknown';
    }

    private async logHttpEvent(
        request: Request,
        httpResponse: { statusCode: number },
        processingTime: number,
        user: { id: string; email: string } | null
    ) {
        const httpMethod = request.method;
        const endpoint = request.url;
        const statusCode = httpResponse.statusCode || 200;

        // Determinar el tipo de acción basado en el método HTTP
        let action: AuditAction;
        switch (httpMethod) {
            case 'POST':
                action = AuditAction.CREATE;
                break;
            case 'GET':
                action = AuditAction.READ;
                break;
            case 'PUT':
            case 'PATCH':
                action = AuditAction.UPDATE;
                break;
            case 'DELETE':
                action = AuditAction.DELETE;
                break;
            default:
                action = AuditAction.READ;
        }

        // No registrar endpoints que ya tienen su propio audit específico
        const skipPatterns = ['/health', '/metrics', '/auth/', '/abac/can-access', '/abac/batch-evaluate', '/audit/'];
        if (skipPatterns.some(p => endpoint.includes(p))) {
            return;
        }

        await this.auditService.logEvent(action, {
            endpoint,
            httpMethod,
            statusCode,
            userId: user?.id,
            userEmail: user?.email,
            isSuccess: true,
            description: `${httpMethod} ${endpoint.split('?')[0]}`,
            ipAddress: this.getClientIp(request),
            userAgent: request.get('user-agent'),
            processingTime,
            correlationId: request.get('x-correlation-id'),
            details: {
                method: httpMethod,
                url: endpoint,
                statusCode,
                processingTimeMs: processingTime
            }
        });
    }
}
