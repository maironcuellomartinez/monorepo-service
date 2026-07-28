// ecosystem.config.cjs
// PM2 sirve el build con `vite preview` (no 'serve') — hereda el proxy /api
// definido en vite.config.ts. En staging/prod, Apache reverse-proxea /api al
// gateway antes de llegar acá (mismo patrón que api-middleware-service/
// dashboard). Requiere 'npm run build[:staging|:prod]' antes de arrancar —
// vite preview falla sin dist/. Sirve en la raíz del dominio (base: '/',
// default de Vite) — es la app principal de cliente, a diferencia de los
// otros 3 dashboards que van bajo un sub-path.
//
// Uso:
//   pm2 start ecosystem.config.cjs --env development
//   pm2 start ecosystem.config.cjs --env staging
//   pm2 start ecosystem.config.cjs --env production

'use strict';

module.exports = {
    apps: [
        {
            name: 'event-corner-app',
            script: 'node_modules/vite/bin/vite.js',
            args: 'preview --host --port 5175',
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
