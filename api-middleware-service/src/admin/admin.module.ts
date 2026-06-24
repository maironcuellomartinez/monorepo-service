import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSessionGuard } from './guards/admin-session.guard';
import { AdminEntity } from './entities/admin.entity';
import { JWT_ADMIN_SERVICE } from '../auth/guards/admin-or-access.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([AdminEntity]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject:  [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret:      config.get<string>('admin.sessionSecret')!,
                signOptions: { issuer: 'api-middleware-service', expiresIn: '24h' },
            }),
        }),
    ],
    controllers: [AdminController],
    providers:   [
        AdminService,
        AdminSessionGuard,
        {
            provide: JWT_ADMIN_SERVICE,
            useFactory: (jwtService: JwtService) => jwtService,
            inject:     [JwtService],
        },
    ],
    exports:     [AdminSessionGuard, JwtModule, JWT_ADMIN_SERVICE],
})
export class AdminModule {}
