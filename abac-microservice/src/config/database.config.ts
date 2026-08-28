import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs('database', (): TypeOrmModuleOptions => {
    return {
        type: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10) || 3306,
        username: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'abac_db',
        autoLoadEntities: true,
        // Antes fijo en `true` sin condición de entorno — TypeORM reescribía
        // el schema de abac_db (usuarios, roles, permisos) en cada arranque,
        // producción incluida. SYNCHRONIZE_DATABASE=true solo en dev (ver
        // .env.development) — es el mecanismo real de creación de schema acá
        // (las migraciones legacy en src/migrations/ están rotas, no correrlas).
        synchronize: process.env.SYNCHRONIZE_DATABASE === 'true',
        logging: false,
        dropSchema: false,
        // En standalone (tsc) el glob resolvería archivos reales y conflictuaría
        // con synchronize: true. Se usa array vacío — las migraciones se corren
        // manualmente con `npm run migration:run` cuando sea necesario.
        migrations: [],
    } as TypeOrmModuleOptions;
});
