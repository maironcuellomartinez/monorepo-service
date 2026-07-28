// ecosystem.config.cjs
// PM2 sirve el build con `vite preview` (no 'serve') — hereda el proxy /api
// -> api-snowq-service definido en vite.config.ts. En staging/prod, Apache
// igual resuelve /api en el mismo dominio antes de llegar acá (mismo patrón
// que api-middleware-service/dashboard). Requiere 'npm run build[:staging|
// :prod]' antes de arrancar — vite preview falla sin dist/. Sirve bajo
// /snowq/ (base fijo en vite.config.ts).
//
// Uso:
//   pm2 start ecosystem.config.cjs --env development
//   pm2 start ecosystem.config.cjs --env staging
//   pm2 start ecosystem.config.cjs --env production

'use strict';

module.exports = {
    apps: [
        {
            name: 'api-snowq-dashboard',
            script: 'node_modules/vite/bin/vite.js',
            args: 'preview --host --port 3091',
            cwd: __dirname,
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
            },
            env_staging: {
                NODE_ENV: 'staging',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
