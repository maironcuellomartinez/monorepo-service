import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application } from '../../entities/application.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'api-key') {
    private readonly logger = new Logger(ApiKeyStrategy.name);

    constructor(
        @InjectRepository(Application)
        private appRepository: Repository<Application>,
    ) {
        super({ header: 'X-API-KEY', prefix: '' }, true);
    }

    async validate(apiKey: string, done: (error: Error | null, payload?: any, info?: any) => void) {
        try {
            const app = await this.validateApiKey(apiKey);
            if (!app) {
                this.logger.warn('Intento de acceso con API Key inválida', { apiKey: this.maskApiKey(apiKey) });
                return done(new UnauthorizedException('API Key inválida'), false);
            }
            this.logger.log('Acceso autorizado con API Key', { appId: app.id, appName: app.name });
            return done(null, app);
        } catch (error) {
            this.logger.error('Error durante la validación de API Key', (error as Error).stack, {
                apiKey: this.maskApiKey(apiKey),
                error: (error as Error).message
            });
            return done((error as Error), null);
        }
    }

    async validateApiKey(apiKey: string): Promise<Application | null> {
        const app = await this.appRepository.findOne({
            where: { apiKey, isActive: true },
            select: ['id', 'name', 'apiKey', 'apiSecret', 'environment'],
        });

        return app
    }

    private maskApiKey(apiKey: string): string {
        return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
    }
}
