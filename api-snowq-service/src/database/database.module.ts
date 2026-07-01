import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { databaseConnection } from 'src/common';
import { SnowRequestEntity } from 'src/snow-requests/entities/snow-request.entity';
import { SnowRequestLog } from 'src/snow-requests/entities/snow-request-log.entity';
import { SnowRequestArchive } from 'src/snow-requests/entities/snow-request-archive.entity';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            // main.ts pre-carga .env.<NODE_ENV> con dotenv antes de que NestJS arranque,
            // así que process.env ya está poblado aquí. No necesitamos envFilePath.
            ignoreEnvFile: true,
            validationSchema: Joi.object().keys({
                HOST_DATABASE: Joi.string().required(),
                PORT_DATABASE: Joi.number().default(3306),
                USERNAME_DATABASE: Joi.string().required(),
                PASSWORD_DATABASE: Joi.string().required(),
                DATABASE_DATABASE: Joi.string().required(),
                SYNCHRONIZE_DATABASE: Joi.boolean().default(false),
                LOGGING_DATABASE: Joi.boolean().default(false),
                BASE_URL_SERVICENOW: Joi.string().allow('').optional(),
                SN_AUTH: Joi.string().allow('').optional(),
                RECONCILER_ENABLED: Joi.boolean().default(false),
                RECONCILER_INTERVAL_SECONDS: Joi.number().min(30).default(300),
                RECONCILER_BATCH_SIZE: Joi.number().min(1).default(20),
                ARCHIVE_RETENTION_DAYS: Joi.number().min(1).default(30),
            }),
            load: [databaseConnection],
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'mysql',
                host: configService.get<string>('host_database', 'database'),
                port: configService.get<number>('port_database'),
                username: configService.get<string>('username_database'),
                password: configService.get<string>('password_database'),
                database: configService.get<string>('database_database'),
                entities: [SnowRequestEntity, SnowRequestLog, SnowRequestArchive],
                synchronize: configService.get<boolean>('synchronize_database'),
                logging: configService.get<boolean>('logging_database'),
                extra: {
                    connectionLimit: 10,
                },
            }),
        }),
    ],
    exports: [TypeOrmModule],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DatabaseModule.name);
    private database: string;

    constructor(private readonly configService: ConfigService) {
        this.database = this.configService.get<string>('database_database') as string;
    }

    onModuleInit() {
        this.logger.log(`Conectando a base de datos: ${this.database}`);
    }

    onModuleDestroy() {
        this.logger.warn(`Desconectando de base de datos: ${this.database}`);
    }
}
