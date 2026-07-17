// ecosystem.config.js
// Config PM2 standalone de api-snowq-service — independiente del ecosystem
// compartido de monolito-event-corner_v3. Lee .env.[environment] de esta
// misma carpeta y los pasa a PM2. No contiene secretos — puede commitearse.
//
// Uso:
//   pm2 start ecosystem.config.js --env development
//   pm2 start ecosystem.config.js --env staging
//   pm2 start ecosystem.config.js --env production

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parsea un archivo .env.[environment] y devuelve sus variables como objeto.
 * Ignora líneas vacías y comentarios (#).
 * Lanza un error si el archivo no existe para evitar arrancar con vars vacías.
 */
function loadEnv(environment) {
    const filePath = path.join(__dirname, `.env.${environment}`);

    if (!fs.existsSync(filePath)) {
        throw new Error(
            `[ecosystem] Archivo de entorno no encontrado: ${filePath}\n` +
            `  → Crea api-snowq-service/.env.${environment} antes de arrancar.`,
        );
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const result = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        result[key] = value;
    }

    return result;
}

module.exports = {
    apps: [
        {
            name: 'api-snowq-service',
            script: './dist/main.js',
            cwd: __dirname,
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
                ...loadEnv('development'),
            },
            env_staging: {
                NODE_ENV: 'staging',
                ...loadEnv('staging'),
            },
            env_production: {
                NODE_ENV: 'production',
                ...loadEnv('production'),
            },
        },
    ],
};
