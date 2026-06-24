# Simulators

Scripts de prueba para el ecosistema Event Corner. No requieren compilación ni dependencias externas — solo Node.js.

## Variables de entorno

| Variable | Default | Usado por |
|---|---|---|
| `GATEWAY_URL` | `http://localhost:3000` | gateway-simulator.js |
| `SNOWQ_URL` | `http://localhost:3090` | snow-request-simulator.js, thruk-simulator.js, combined-simulator.js |

## Comandos rápidos (desde raíz del workspace)

```bash
# Incident via api-snowq-service
npm run sim:incident
npm run sim:incident:immediate

# DLQ
npm run sim:dlq
npm run sim:retry-all

# Nagios/Thruk
npm run sim:storm
npm run sim:recovery
npm run sim:dedup

# Flujos combinados
npm run sim:full-lifecycle
npm run sim:cascade
npm run sim:parallel

# Gateway completo (requiere seeds ejecutados)
npm run sim:gateway -- incidents --email empleado1@eventcorner.com --password <pwd> --customer-id <uuid>
```

## Uso directo con opciones

```bash
# snow-request-simulator — tipos válidos: incident | change-request | problem | service-catalog | knowledge-article | release-task | configuration-item
node simulators/snow-request-simulator.js queue --type incident --severity critical
node simulators/snow-request-simulator.js status --id <correlationId>
node simulators/snow-request-simulator.js retry --id <correlationId>
node simulators/snow-request-simulator.js scenario --name all-immediate

# thruk-simulator
node simulators/thruk-simulator.js problem --host web01 --service HTTP
node simulators/thruk-simulator.js recovery --host web01 --service HTTP
node simulators/thruk-simulator.js scenario --name ttl-expire

# combined-simulator
node simulators/combined-simulator.js list
node simulators/combined-simulator.js scenario --name infra-outage

# gateway-simulator (requiere seeds)
node simulators/gateway-simulator.js incidents --email empleado1@eventcorner.com --password <pwd> --customer-id <uuid> --count 3 --parallel
```

## URL override

```bash
SNOWQ_URL=http://staging:3090 npm run sim:storm
GATEWAY_URL=http://staging:3000 npm run sim:gateway -- incidents ...
```
