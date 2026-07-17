# api-snowq-service

Cola inteligente + circuit breaker + bulkhead entre el ecosistema **Event Corner** y **ServiceNow**.

Documentación completa: **[API_SNOWQ_SERVICE.md](./API_SNOWQ_SERVICE.md)** — arquitectura, variables
de entorno, autenticación (Basic/OAuth2), endpoints, flujos de cola y de monitoreo (Nagios/Thruk),
resiliencia (circuit breaker + bulkhead), manejo de errores y reintentos, jobs programados y
esquema de tablas.

## Quick start

```bash
npm install
npm run start:dev    # dev — apunta al simulador local de ServiceNow (servicenow-clone-backend)
```

Swagger: `http://localhost:3090/docs` (dev/staging).

## Tests

```bash
npm test
npm run test:cov
npm run test:e2e
```
