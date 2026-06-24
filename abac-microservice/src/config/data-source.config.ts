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
  password: process.env.DB_PASSWORD || 'root',
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

export default new DataSource(dataSourceOptions);