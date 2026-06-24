import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private reflector: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        return super.canActivate(context);
    }

    handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
        const result = super.handleRequest(err, user, info, context);

        // Extraer _application del user y ponerlo en request.application
        // para que RolesGuard pueda accederlo
        if (user && user._application) {
            const request = context.switchToHttp().getRequest();
            request.application = user._application;
            delete user._application;
        }

        return result;
    }
}
