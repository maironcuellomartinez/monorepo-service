import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AccessTokenGuard implements CanActivate {
    constructor(
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) { }

    canActivate(ctx: ExecutionContext): boolean {
        const request = ctx.switchToHttp().getRequest<Request>();
        const auth = request.headers.authorization as string | undefined;

        if (!auth?.startsWith('Bearer ')) {
            throw new UnauthorizedException('Se requiere access_token');
        }

        const token = auth.slice(7);
        const secret = this.config.get<string>('jwt.secret')!;

        try {
            const payload = this.jwt.verify(token, {
                secret,
                issuer: 'api-middleware-service',
                audience: 'external-clients',
            }) as any;
            if (payload.type !== 'external_client') {
                throw new UnauthorizedException('Token no pertenece a una aplicación externa');
            }
            (request as any).externalClient = { clientId: payload.sub, clientName: payload.clientName };
            return true;
        } catch (err: any) {
            if (err instanceof UnauthorizedException) throw err;
            throw new UnauthorizedException('Token inválido o expirado');
        }
    }
}
