import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Guard para endpoints administrativos (/clients).
 * Valida que el header `x-admin-api-key` coincida con la variable de entorno `ADMIN_API_KEY`.
 * Si `ADMIN_API_KEY` no está configurada, deniega todo acceso en producción.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
    constructor(private readonly config: ConfigService) { }

    canActivate(ctx: ExecutionContext): boolean {
        const expected = this.config.get<string>('admin.apiKey');
        if (!expected) {
            throw new ForbiddenException('Administración no configurada');
        }

        const request = ctx.switchToHttp().getRequest<Request>();
        const provided = request.headers['x-admin-api-key'] as string | undefined;

        if (!provided) {
            throw new ForbiddenException('API key de administración inválida');
        }

        const expectedBuf = Buffer.from(expected);
        const providedBuf = Buffer.from(provided);
        const valid = expectedBuf.length === providedBuf.length &&
            crypto.timingSafeEqual(expectedBuf, providedBuf);

        if (!valid) {
            throw new ForbiddenException('API key de administración inválida');
        }

        return true;
    }
}
