// ecosystem.config.js
// Config PM2 de minerva-app — mock local de Minerva SOAP (inventario de
// dispositivos), solo tiene sentido en development (staging/production usan
// el sistema Minerva real).
//
// Uso:
//   pm2 start ecosystem.config.js --env development

'use strict';

module.exports = {
    apps: [
        {
            name: 'minerva-app',
            script: './dist/main.js',
            cwd: __dirname,
            instances: 1,
            exec_mode: 'fork',
            env_development: {
                NODE_ENV: 'development',
            },
        },
    ],
};
