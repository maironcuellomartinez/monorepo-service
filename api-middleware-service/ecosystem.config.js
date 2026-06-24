'use strict';

// TLS 1.3 es responsabilidad del Apache que actúa como reverse proxy.
// Este proceso solo corre el NestJS en HTTP en localhost:3007.

module.exports = {
  apps: [
    {
      name: 'api-middleware-service',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
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
