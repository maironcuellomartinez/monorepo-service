// import { DataSource, DataSourceOptions } from 'typeorm';
// import { ConfigService } from '@nestjs/config';
// import { config } from 'dotenv';

// config();

// const configService = new ConfigService();

// export const dataSourceOptions: DataSourceOptions = {
//     type: 'mysql',
//     host: configService.get('DB_HOST') || 'localhost',
//     port: configService.get('DB_PORT') || 3306,
//     username: configService.get('DB_USERNAME') || 'root',
//     password: configService.get('DB_PASSWORD') || '',
//     database: configService.get('DB_NAME') || 'abac_db',
//     entities: ['dist/**/*.entity{.ts,.js}'],
//     migrations: ['dist/migrations/*{.ts,.js}'],
//     synchronize: false,
//     logging: process.env.NODE_ENV !== 'production',
//     migrationsTableName: 'migrations',
//     migrationsRun: false,
//     extra: {
//         charset: 'utf8mb4_unicode_ci',
//     },
// };

// const dataSource = new DataSource(dataSourceOptions);
// export default dataSource;

import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config();

const isProduction = process.env.NODE_ENV === 'production';

export const dataSourceOptions: DataSourceOptions = {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'abac_db',
    entities: [
        isProduction
            ? path.join(__dirname, '..', '**', '*.entity.js')
            : path.join(__dirname, '..', '**', '*.entity.ts')
    ],
    migrations: [
        isProduction
            ? path.join(__dirname, '..', 'migrations', '*.js')
            : path.join(__dirname, '..', 'migrations', '*.ts')
    ],
    synchronize: false,
    logging: !isProduction,
    migrationsTableName: 'migrations',
    migrationsRun: false,
    connectorPackage: 'mysql2',
    extra: {
        charset: 'utf8mb4_unicode_ci',
    },
};

export const dataSource = new DataSource(dataSourceOptions);