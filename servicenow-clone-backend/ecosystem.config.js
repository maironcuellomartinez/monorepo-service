// ecosystem.config.js
// Config PM2 de servicenow-clone-backend — mock local de ServiceNow, solo
// tiene sentido en development (staging/production usan el ServiceNow real).
//
// Uso:
//   pm2 start ecosystem.config.js --env development

'use strict';

module.exports = {
    apps: [
        {
            name: 'servicenow-clone-backend',
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
