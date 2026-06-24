import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenCleanupJob } from './token-cleanup.job';
import { AccessTokenGuard } from './guards/access-token.guard';
import { OAuthBulkheadInterceptor } from './interceptors/oauth-bulkhead.interceptor';
import { AdminOrAccessGuard, JWT_AUTH_SERVICE } from './guards/admin-or-access.guard';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { ClientsModule } from '../clients/clients.module';
import { BulkheadModule } from '@backendkit-labs/bulkhead/nestjs';
import { AdminModule } from '../admin/admin.module';

@Module({
    imports: [
        ClientsModule,
        BulkheadModule,
        AdminModule,
        TypeOrmModule.forFeature([RefreshTokenEntity]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('jwt.secret')!,
                signOptions: { issuer: 'api-middleware-service', audience: 'external-clients' },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        TokenCleanupJob,
        AccessTokenGuard,
        OAuthBulkheadInterceptor,
        AdminOrAccessGuard,
        {
            provide: JWT_AUTH_SERVICE,
            useFactory: (jwtService: JwtService) => jwtService,
            inject: [JwtService],
        },
    ],
    exports: [JwtModule, AccessTokenGuard, AdminOrAccessGuard, JWT_AUTH_SERVICE],
})
export class AuthModule { }
