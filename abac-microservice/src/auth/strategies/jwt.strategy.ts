import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserApplication, Application } from '../../entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        @InjectRepository(User) private userRepository: Repository<User>,
        @InjectRepository(UserRole) private userRoleRepository: Repository<UserRole>,
        @InjectRepository(UserApplication) private userApplicationRepository: Repository<UserApplication>,
        @InjectRepository(Application) private applicationRepository: Repository<Application>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                (request) => request?.cookies?.access_token,
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET')!,
            issuer: configService.get<string>('JWT_ISSUER') || 'abac-service',
            audience: configService.get<string>('JWT_AUDIENCE') || 'abac-clients',
        });
    }

    async validate(payload: any) {
        const userId = payload.sub;
        let appId = payload.appId || payload.applicationId || '';

        // Cargar usuario de BD
        const user = await this.userRepository.findOne({
            where: { id: userId, isActive: true },
        });

        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado o inactivo');
        }

        // Resolver appId si viene vacío: buscar primera app del usuario
        if (!appId) {
            const ua = await this.userApplicationRepository.findOne({
                where: { userId, isActive: true },
                order: { createdAt: 'ASC' },
            });
            appId = ua?.applicationId || '';
        }

        // Cargar roles con relación role (para RolesGuard)
        const userRoles = await this.userRoleRepository.find({
            where: { userId, isActive: true, ...(appId ? { applicationId: appId } : {}) },
            relations: ['role'],
        });

        // Cargar application (para RolesGuard → request.application)
        let application: Application | null = null;
        if (appId) {
            application = await this.applicationRepository.findOne({
                where: { id: appId, isActive: true },
            });
        }

        return {
            id: user.id,
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            accountType: user.accountType,
            roles: userRoles,
            appId,
            _application: application,
        };
    }
}
