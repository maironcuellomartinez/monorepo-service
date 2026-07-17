// ecosystem.config.js
// Lee los archivos .env.[environment] de cada app y los pasa a PM2.
// Este archivo NO contiene secretos — puede commitearse con seguridad.
//
// Uso:
//   pm2 start ecosystem.config.js --env development
//   pm2 start ecosystem.config.js --env staging
//   pm2 start ecosystem.config.js --env production

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Parsea un archivo .env.[environment] y devuelve sus variables como objeto.
 * Ignora líneas vacías y comentarios (#).
 * Lanza un error si el archivo no existe para evitar arrancar con vars vacías.
 */
function loadEnv(appRelPath, environment) {
    const filePath = path.join(__dirname, appRelPath, `.env.${environment}`);

    if (!fs.existsSync(filePath)) {
        throw new Error(
            `[ecosystem] Archivo de entorno no encontrado: ${filePath}\n` +
            `  → Copia ${appRelPath}/.env.example como ${appRelPath}/.env.${environment} y rellena los valores.`,
        );
    }

    const lines  = fs.readFileSync(filePath, 'utf-8').split('\n');
    const result = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key   = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        result[key] = value;
    }

    return result;
}

const APPS = {
    'api-gateway':           'apps/api-gateway',
    'monolith':              'apps/monolith',
    'abac':                  '../abac-microservice',
    'integration-service':   '../integration-service',
    'observability-service': '../observability-service',
    'api-snowq-service':     '../api-snowq-service',
};

module.exports = {
    apps: [
        // ── API Gateway ───────────────────────────────────────────────────────
        {
            name:      'api-gateway',
            script:    './dist/apps/api-gateway/main.js',
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
                ...loadEnv(APPS['api-gateway'], 'development'),
            },
            env_staging: {
                NODE_ENV: 'staging',
                ...loadEnv(APPS['api-gateway'], 'staging'),
            },
            env_production: {
                NODE_ENV: 'production',
                ...loadEnv(APPS['api-gateway'], 'production'),
            },
        },

        // ── Monolith ──────────────────────────────────────────────────────────
        {
            name:      'monolith',
            script:    './dist/apps/monolith/main.js',
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
                ...loadEnv(APPS['monolith'], 'development'),
            },
            env_staging: {
                NODE_ENV: 'staging',
                ...loadEnv(APPS['monolith'], 'staging'),
            },
            env_production: {
                NODE_ENV: 'production',
                ...loadEnv(APPS['monolith'], 'production'),
            },
        },

        // ── ABAC Microservice ─────────────────────────────────────────────────
        {
            name:      'abac',
            script:    path.join(__dirname, '../abac-microservice/dist/src/main.js'),
            cwd:       path.join(__dirname, '../abac-microservice'),
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
                ...loadEnv(APPS['abac'], 'development'),
            },
            env_staging: {
                NODE_ENV: 'staging',
                ...loadEnv(APPS['abac'], 'staging'),
            },
            env_production: {
                NODE_ENV: 'production',
                ...loadEnv(APPS['abac'], 'production'),
            },
        },

        // ── Integration Service ────────────────────────────────────────────────
        {
            name:      'integration-service',
            script:    path.join(__dirname, '../integration-service/dist/main.js'),
            cwd:       path.join(__dirname, '../integration-service'),
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
                ...loadEnv(APPS['integration-service'], 'development'),
            },
            env_staging: {
                NODE_ENV: 'staging',
                ...loadEnv(APPS['integration-service'], 'staging'),
            },
            env_production: {
                NODE_ENV: 'production',
                ...loadEnv(APPS['integration-service'], 'production'),
            },
        },

        // ── Observability Service ─────────────────────────────────────────────
        {
            name:      'observability-service',
            script:    path.join(__dirname, '../observability-service/dist/main.js'),
            cwd:       path.join(__dirname, '../observability-service'),
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
                ...loadEnv(APPS['observability-service'], 'development'),
            },
            env_staging: {
                NODE_ENV: 'staging',
                ...loadEnv(APPS['observability-service'], 'staging'),
            },
            env_production: {
                NODE_ENV: 'production',
                ...loadEnv(APPS['observability-service'], 'production'),
            },
        },

        // ── api-snowq-service ─────────────────────────────────────────────────
        {
            name:      'api-snowq-service',
            script:    path.join(__dirname, '../api-snowq-service/dist/main.js'),
            cwd:       path.join(__dirname, '../api-snowq-service'),
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
                ...loadEnv(APPS['api-snowq-service'], 'development'),
            },
            env_staging: {
                NODE_ENV: 'staging',
                ...loadEnv(APPS['api-snowq-service'], 'staging'),
            },
            env_production: {
                NODE_ENV: 'production',
                ...loadEnv(APPS['api-snowq-service'], 'production'),
            },
        },
    ],
};
