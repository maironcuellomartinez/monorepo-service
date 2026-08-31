import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    ForbiddenException,
    ServiceUnavailableException,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApplicationService } from '../services/application.service';
import { CacheService } from '../../cache/cache.service';
import { IS_PUBLIC_API_KEY } from '../decorators/public-api.decorator';
import { Application } from 'src/entities';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(ApiKeyGuard.name);
    private readonly rateLimitCache = new Map<string, { count: number; timestamp: number }>();

    constructor(
        private readonly applicationService: ApplicationService,
        private readonly cacheService: CacheService,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_API_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        const apiKey = this.extractApiKeyFromRequest(request);

        if (!apiKey) {
            this.logger.warn('No API key provided in request');
            throw new UnauthorizedException('API key is required');
        }

        // Rate limiting check
        if (!this.checkRateLimit(apiKey, request.ip ?? 'unknown')) {
            this.logger.warn(`Rate limit exceeded for API key: ${apiKey.substring(0, 10)}...`);
            throw new ForbiddenException('Rate limit exceeded');
        }

        // Check cache first — short-circuit DB lookup
        const cachedApp = await this.cacheService.get(`api_key:${apiKey}`) as Application;
        if (cachedApp) {
            request.application = cachedApp;
            request['apiKey'] = apiKey;
            this.logger.debug(`API key validated from cache: ${apiKey.substring(0, 10)}...`);
            return true;
        }

        // Cache miss — validate against database
        let application: Application | null;
        try {
            application = await this.applicationService.validateApiKey(apiKey);
        } catch (error) {
            this.logger.error(`Error validando API key contra la base de datos: ${(error as Error).message}`);
            throw new ServiceUnavailableException('No se pudo validar la API key — servicio no disponible');
        }
        if (!application) {
            this.logger.warn(`Invalid API key attempted: ${apiKey.substring(0, 10)}...`);
            throw new UnauthorizedException('Invalid API key');
        }

        if (!application.isActive) {
            this.logger.warn(`Attempt to use inactive application: ${application.name}`);
            throw new ForbiddenException('Application is inactive');
        }

        // Cache con TTL corto para detectar desactivaciones rápidamente
        await this.cacheService.set(
            `api_key:${apiKey}`,
            {
                id: application.id,
                name: application.name,
                isActive: application.isActive,
                settings: application.settings,
            },
            300, // 5 minutos (no 1 hora) — balance entre performance y detección de desactivación
        );

        request['application'] = application;
        request['apiKey'] = apiKey;

        this.logger.log(`API key validated successfully for application: ${application.name}`);
        return true;
    }

    private extractApiKeyFromRequest(request: Request): string | null {
        // Solo headers — nunca query string. `CustomLog … combined` (Apache,
        // ver deploy/apache-staging.conf) escribe la línea de request
        // completa a disco, con query incluida: una API key en `?api_key=`
        // queda en el log del servidor, en el historial del navegador y en
        // el Referer hacia terceros (ver M-05 en la auditoría de 2026-08-31).
        const sources = [
            // X-API-Key header (fuente principal)
            () => request.headers['x-api-key'] as string,
            // Custom header
            () => request.headers['api-key'] as string,
        ];

        for (const source of sources) {
            const apiKey = source();
            if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0) {
                return apiKey.trim();
            }
        }

        return null;
    }

    private checkRateLimit(apiKey: string, ip: string): boolean {
        const key = `rate_limit:${apiKey}:${ip}`;
        const now = Date.now();
        const windowSize = 60000; // 1 minute window

        // Clean up old entries
        this.cleanupRateLimitCache(now);

        if (!this.rateLimitCache.has(key)) {
            this.rateLimitCache.set(key, { count: 1, timestamp: now });
            return true;
        }

        const entry = this.rateLimitCache.get(key)!;

        if (now - entry.timestamp > windowSize) {
            // Reset counter for new time window
            entry.count = 1;
            entry.timestamp = now;
            return true;
        }

        // Check if within rate limit (500 requests per minute)
        if (entry.count >= 500) {
            return false;
        }

        entry.count++;
        return true;
    }

    private cleanupRateLimitCache(currentTime: number): void {
        const windowSize = 60000;
        for (const [key, entry] of this.rateLimitCache.entries()) {
            if (currentTime - entry.timestamp > windowSize * 2) {
                // Remove entries older than 2 windows
                this.rateLimitCache.delete(key);
            }
        }
    }
}