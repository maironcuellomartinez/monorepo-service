// apps/micorner/data-source.ts
//
// DataSource standalone para el CLI de TypeORM (migration:run / migration:revert).
// Se invoca desde la raíz del monorepo, igual que micorner:seed/micorner:wipe:
//   npm run micorner:migration:run
//
// Carga el mismo .env.<NODE_ENV> que micorner.module.ts (vía process.cwd(),
// no __dirname — los scripts viejos de este directorio resuelven la ruta
// relativa al archivo compilado y terminan sin cargar ningún .env real,
// dependiendo por casualidad de que los defaults hardcodeados coincidan
// con los valores reales).
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import { InitialSchema1788194786468 } from './src/infrastructure/persistence/typeorm/migrations/1788194786468-InitialSchema';
import { FixAppointmentsIssueIdAutoIncrement1788963265894 } from './src/infrastructure/persistence/typeorm/migrations/1788963265894-FixAppointmentsIssueIdAutoIncrement';

const env = process.env.NODE_ENV ?? 'development';
config({ path: path.resolve(process.cwd(), 'apps/micorner', `.env.${env}`) });

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10) || 3306,
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_DATABASE || 'event_corner',
  entities: [
    'apps/micorner/src/infrastructure/persistence/typeorm/entities/*.ts',
  ],
  migrations: [
    InitialSchema1788194786468,
    FixAppointmentsIssueIdAutoIncrement1788963265894,
  ],
  synchronize: false,
  logging: true,
});
