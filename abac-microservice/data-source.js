"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataSource = exports.dataSourceOptions = void 0;
const typeorm_1 = require("typeorm");
const dotenv_1 = require("dotenv");
const path = require("path");
(0, dotenv_1.config)();
const isProduction = process.env.NODE_ENV === 'production';
exports.dataSourceOptions = {
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
exports.dataSource = new typeorm_1.DataSource(exports.dataSourceOptions);
//# sourceMappingURL=data-source.js.map