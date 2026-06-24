import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User, UserRole, UserApplication, Application } from '../entities';

@Module({
    imports: [
        TypeOrmModule.forFeature([User, UserRole, UserApplication, Application]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => {
                const secret = configService.get<string>('JWT_SECRET');
                if (!secret) {
                    throw new Error('JWT_SECRET no configurado — revisa el archivo .env');
                }
                return {
                    secret,
                    signOptions: {
                        expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '1h') as any,
                        issuer:    configService.get<string>('JWT_ISSUER')    || 'abac-service',
                        audience:  configService.get<string>('JWT_AUDIENCE')  || 'abac-clients',
                    },
                };
            },
            inject: [ConfigService],
        }),
    ],
    providers: [JwtStrategy],
    exports: [JwtModule],
})
export class AuthModule { }
