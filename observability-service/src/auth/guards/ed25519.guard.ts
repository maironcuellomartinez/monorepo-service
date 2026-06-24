import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { JwtEd25519Service } from '../../common/jwt-ed25519.service';

@Injectable()
export class Ed25519Guard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(ctx: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);
        if (isPublic) return true;

        const req = ctx.switchToHttp().getRequest<Request>();
        const auth = req.headers.authorization as string | undefined;
        if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('M2M JWT requerido');

        const publicKey = process.env.ED25519_PUBLIC_KEY;
        if (!publicKey) throw new UnauthorizedException('ED25519_PUBLIC_KEY no configurado');

        const result = JwtEd25519Service.verifyWithKey(publicKey, auth.slice(7), {
            verifyExpiration: true,
            verifyClaims: {
                iss: process.env.JWT_ISSUER ?? 'abac-service',
                aud: process.env.JWT_AUDIENCE ?? 'abac-clients',
            },
        });

        if (!result.valid) throw new UnauthorizedException(`Token inválido: ${result.error}`);
        if (result.payload?.type !== 'service') throw new UnauthorizedException('Solo tokens de servicio M2M');

        return true;
    }
}
