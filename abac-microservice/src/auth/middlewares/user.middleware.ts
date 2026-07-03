import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { LoggerService } from '../../observability';

@Injectable()
export class UserMiddleware implements NestMiddleware {
    constructor(private jwtService: JwtService, private logger: LoggerService) { }

    use(req: Request, res: Response, next: NextFunction) {
        const token = this.extractToken(req);

        if (token) {
            try {
                const payload = this.jwtService.verify(token);
                req['user'] = payload;
            } catch (error) {
                // No autenticado: el guard correspondiente decide si eso bloquea el request.
                // Se deja un rastro en debug para poder diagnosticar tokens malformados/expirados.
                this.logger.debug(`Token inválido en UserMiddleware: ${(error as Error).message}`, 'AUTH');
            }
        }

        next();
    }

    private extractToken(req: Request): string | null {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }
}