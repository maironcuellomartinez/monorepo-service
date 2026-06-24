import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { HttpClient } from '@backendkit-labs/http-client';
import { InjectHttpClient } from '@backendkit-labs/http-client/nestjs';
import { ABAC_HTTP, ABAC_HTTP_NOCB } from '../http/http-client.tokens';

export interface CanAccessRequest {
    userId: string;
    applicationId: string;
    resource: string;
    action: string;
    context?: Record<string, unknown>;
}

export interface BatchCheckItem {
    resource: string;
    action: string;
    context?: Record<string, unknown>;
}

export interface BatchCheckResult {
    resource: string;
    action: string;
    granted: boolean;
}

export interface TokenValidationResult {
    valid: boolean;
    oid: string;
    email: string;
    userId: string;
    permissions: string[];
    firstName?: string;
    lastName?: string;
    tokenType: string;
}

@Injectable()
export class AbacClient {
    private readonly logger = new Logger(AbacClient.name);
    private readonly apiKey: string;
    private readonly appId: string;

    constructor(
        // Cliente normal (con circuit breaker) para roles / batch / can-access.
        @InjectHttpClient(ABAC_HTTP) private readonly http: HttpClient,
        // Cliente sin circuit breaker: auth crítica, siempre intenta la red.
        @InjectHttpClient(ABAC_HTTP_NOCB) private readonly httpNoCb: HttpClient,
    ) {
        this.apiKey = process.env.ABAC_API_KEY ?? '';
        this.appId = process.env.ABAC_APP_ID ?? '';

        if (!this.apiKey || !this.appId) {
            this.logger.warn('ABAC_API_KEY o ABAC_APP_ID no configurados — permisos NO se verificarán correctamente');
        }
    }

    private get apiKeyHeader(): Record<string, string> {
        return { 'x-api-key': this.apiKey };
    }

    // ── Token validation ────────────────────────────────────────────────────

    async validateToken(token: string): Promise<TokenValidationResult | null> {
        const res = await this.httpNoCb.post<TokenValidationResult>(
            '/auth/validate-entra',
            { token, applicationId: this.appId },
            { headers: this.apiKeyHeader },
        );
        if (!res.ok) {
            this.logger.error(`ABAC validate-token falló: ${res.error.message}`);
            return null;
        }
        return res.value.data;
    }

    // ── ABAC checks ─────────────────────────────────────────────────────────

    async getUserRoles(userId: string): Promise<string[]> {
        const res = await this.http.get<{ roles: string[] }>('/abac/user-roles', {
            params: { userId, applicationId: this.appId },
            headers: this.apiKeyHeader,
        });
        if (!res.ok) {
            this.logger.error(`ABAC unreachable al obtener roles de user ${userId}: ${res.error.message}`);
            return [];
        }
        return res.value.data.roles ?? [];
    }

    async batchEvaluate(
        userId: string,
        items: BatchCheckItem[],
    ): Promise<BatchCheckResult[]> {
        const body = {
            requests: items.map(item => ({
                userId,
                applicationId: this.appId,
                resource: item.resource,
                action: item.action,
                context: item.context ?? {},
            })),
        };

        const res = await this.http.post<{ results: Array<CanAccessRequest & { granted: boolean }> }>(
            '/abac/batch-evaluate',
            body,
            { headers: this.apiKeyHeader },
        );
        if (!res.ok) {
            this.logger.error(`ABAC batch-evaluate falló para user ${userId}: ${res.error.message}`);
            // fail-open: devolver todos como denegados ante error
            return items.map(item => ({ resource: item.resource, action: item.action, granted: false }));
        }
        return res.value.data.results.map(r => ({
            resource: r.resource,
            action: r.action,
            granted: r.granted,
        }));
    }

    async canAccess(
        userId: string,
        resource: string,
        action: string,
        context?: Record<string, unknown>,
    ): Promise<boolean> {
        const body: CanAccessRequest = {
            userId,
            applicationId: this.appId,
            resource,
            action,
            context,
        };

        const res = await this.http.post<{ granted: boolean }>(
            '/abac/can-access',
            body,
            { headers: this.apiKeyHeader },
        );
        if (!res.ok) {
            if (res.error.type === 'http' && res.error.status === 401) {
                throw new UnauthorizedException('ABAC API key inválido');
            }
            this.logger.error(
                `ABAC unreachable al verificar ${resource}:${action} para user ${userId}: ${res.error.message}`,
            );
            return false;
        }
        return res.value.data.granted === true;
    }
}
