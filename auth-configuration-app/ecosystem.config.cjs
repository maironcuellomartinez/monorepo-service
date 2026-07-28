// ecosystem.config.cjs
// PM2 sirve el build con `vite preview` (no 'serve') — hereda el proxy /api
// definido en vite.config.ts (si lo hubiera). En staging/prod, Apache
// reverse-proxea al abac-microservice antes de llegar acá (mismo patrón que
// api-middleware-service/dashboard). Requiere 'npm run build[:staging|:prod]'
// antes de arrancar — vite preview falla sin dist/. Sirve bajo /auth/ (base
// fijo en vite.config.ts).
//
// Uso:
//   pm2 start ecosystem.config.cjs --env development
//   pm2 start ecosystem.config.cjs --env staging
//   pm2 start ecosystem.config.cjs --env production

'use strict';

module.exports = {
    apps: [
        {
            name: 'auth-configuration-app',
            script: 'node_modules/vite/bin/vite.js',
            args: 'preview --host --port 5173',
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
