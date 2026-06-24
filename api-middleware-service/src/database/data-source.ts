import * as dotenv from 'dotenv';
import * as path from 'path';

// Carga el .env del entorno antes de construir el DataSource
const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { DataSource } from 'typeorm';
import { ExternalClientEntity } from '../clients/entities/external-client.entity';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { AdminEntity } from '../admin/entities/admin.entity';

export const AppDataSource = new DataSource({
    type: 'mysql',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? 'root',
    database: process.env.DB_DATABASE ?? 'middleware_db',
    entities: [ExternalClientEntity, RefreshTokenEntity, AdminEntity],
    migrations: [path.join(__dirname, '../migrations/*.{ts,js}')],
    synchronize: false,
});
