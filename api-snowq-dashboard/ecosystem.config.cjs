// ecosystem.config.js
// PM2 sirve el build estático (dist/) con 'serve'. El contenido de dist/
// depende de con qué modo se corrió antes 'npm run build[:staging|:prod]'
// (Vite hornea las VITE_* env vars en el build, no en runtime) — por eso
// pm2:staging/pm2:prod primero rebuildean y después arrancan/recargan.
// Detrás de esto va Apache, que sirve como reverse proxy/TLS termination
// y resuelve /api → api-snowq-service (mismo patrón que api-middleware-service).
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
            script: 'node_modules/serve/build/main.js',
            args: '-s dist -l 3091',
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
