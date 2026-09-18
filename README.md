# Event Corner — Arranque del ecosistema

Ver `CLAUDE.md` para la arquitectura completa (servicios, puertos, variables de entorno, dominio). Este README documenta únicamente **cómo levantar todo el ecosistema local con un solo comando**, de dos formas:

- **`npm run infra:up`** (`scripts/start-infra.js`) — vía PM2. El camino normal.
- **`npm run infra:dev`** (`scripts/start-infra-dev.js`) — sin PM2, para entornos donde PM2 no puede correr (ver [Alternativa sin PM2](#alternativa-sin-pm2-npm-run-infradev) más abajo).

Ambos arrancan los mismos 11 servicios, en el mismo orden de dependencias, con el mismo chequeo de MySQL — difieren solo en cómo ejecutan cada proceso.

## Requisitos previos

- **MySQL** corriendo en el `host:port` que cada servicio tenga configurado en su `.env.development` (normalmente `localhost:3306`, root/root). El script lo verifica y aborta con instrucciones si no responde — no levanta contenedores por vos.
  > Si ya existe una instalación nativa de MySQL en `:3306`, no levantes un contenedor Docker aparte: ambos compitiendo por el mismo puerto genera conexiones ambiguas (ver `CLAUDE.md`).
- **Redis**: no es necesario para este flujo de arranque (no está en la ruta crítica actual).
- **pm2**: no hace falta instalarlo vos. Ya está como `devDependency` de la raíz del workspace (`npm install` en la raíz lo trae). El script usa ese binario local antes que uno global, así que funciona incluso en entornos donde la política no permite instalar paquetes globalmente.

## Uso (con PM2)

Desde la raíz del workspace:

```bash
npm install                 # una sola vez, trae pm2 local entre otras devDependencies

npm run infra:up            # build solo si falta dist/, arranca todo en orden y espera cada puerto
npm run infra:status        # ver estado de pm2 (qué está online)
npm run infra:down          # apagar y borrar todos los apps de pm2 del ecosistema
```

Forzar rebuild de todo (por ejemplo tras un pull con cambios de código):

```bash
npm run infra:up -- --force-build
```

## Qué hace `scripts/start-infra.js`

1. **Verifica MySQL** por cada servicio que tiene DB propia, leyendo su `.env.development` (los nombres de variable difieren entre servicios: `DB_HOST`/`DB_PORT` en la mayoría, `HOST_DATABASE`/`PORT_DATABASE` en `api-snowq-service`, defaults de `localhost:3306` en `servicenow-clone-backend`, que no tiene `.env`).
2. **Arranca en tiers**, respetando el orden de dependencias documentado en `CLAUDE.md`:

   | Tier | Servicios | Depende de |
   |---|---|---|
   | 1 | `servicenow-clone-backend`, `abac`, `observability-service`, `minerva-app` | MySQL (los que tienen DB) |
   | 2 | `api-snowq-service`, `micorner`, `observability-dashboard`, `auth-configuration-app` | tier 1 |
   | 3 | `api-gateway` | micorner + api-snowq-service + abac |
   | 4 | `integration-service`, `event-corner-app` | api-gateway (+ minerva-app en el caso de integration-service) |

   Dentro de cada tier: build (si falta `dist/`, o siempre con `--force-build`) → `pm2 start --only <app>` → espera a que el puerto responda antes de pasar al siguiente tier. Si un servicio no levanta a tiempo, el script aborta indicando `pm2 logs <app>` para investigar.
3. Reusa el `ecosystem.config.js`/`.cjs` que **ya tiene cada servicio** — no inventa uno nuevo ni duplica configuración. `abac`, `micorner`, `api-gateway`, `integration-service` y `observability-service` comparten el de `monolito-event-corner_v3/`; el resto tiene el suyo propio en su carpeta.

## Puertos (dev)

| Servicio | Puerto | Notas |
|---|---|---|
| servicenow-clone-backend | 3010 | mock local de ServiceNow |
| abac | 3005 | Swagger: `/api-docs` |
| observability-service | 3099 | ingesta: `/ingest/{logs,metrics,traces}` |
| minerva-app | 3015 | mock REST de Minerva (inventario) |
| api-snowq-service | 3090 | queue + circuit breaker SN |
| micorner | 3002 | internal only |
| observability-dashboard | 5174 | front Vite |
| auth-configuration-app | 5173 | front Vite (config ABAC) |
| api-gateway | 4000 | Swagger: `/docs` |
| integration-service | 3008 | Swagger: `/api/docs` |
| event-corner-app | 5175 | front Vite (cliente) |

## Alternativa sin PM2 (`npm run infra:dev`)

Para cuando PM2 no puede correr en el entorno — por ejemplo una VM cuyo EDR/antivirus bloquea la creación de procesos detached/en background: el síntoma típico es `spawn EPERM` justo en `pm2 start` (que necesita forkear el daemon + la app) pero **no** en `pm2 --version` (que no forkea nada).

```bash
npm run infra:dev
```

Diferencias clave con `infra:up`:

- **No usa PM2 en absoluto.** Corre cada servicio con su propio `npm run start:dev` (NestJS, `--watch`) o `npm run dev` (Vite) que **ya existe** en cada `package.json` — no hay build ni `dist/` de por medio, arranca en modo watch con hot-reload.
- **No toca la configuración de ninguna app.** Es solo una forma distinta de invocar los mismos comandos que ya existían; cuando se despliega de verdad a un servidor, cada app sigue arrancando independiente vía su propio PM2 — esto no cambia eso.
- **Arranca un servicio a la vez** (mismo orden de dependencias y mismo chequeo de MySQL que `infra:up`), esperando el puerto de cada uno antes de seguir con el siguiente.
- **No hay `--status`/`--down`.** Sin PM2 no hay daemon: el proceso corre en **foreground**, todos los servicios son hijos directos de él, y el propio proceso corriendo *es* el estado. Hay que dejar esa terminal abierta.
- **`Ctrl+C` apaga todo** (mata el árbol completo de procesos). Si el proceso se corta de una forma que no sea `Ctrl+C`/`SIGTERM` (ej. "Finalizar tarea" en el Administrador de tareas, o apagar la VM de golpe), pueden quedar procesos huérfanos ocupando los puertos — igual que le pasaría a cualquier `npm run dev` suelto sin este wrapper. Si pasa, hay que matarlos a mano (`taskkill /pid <pid> /T /F` en Windows, por cada puerto) o reiniciar el entorno.

## Primera vez

Si es un entorno nuevo (bases vacías), después de `npm run infra:up` (o `infra:dev`) correr la secuencia de seeds documentada en `CLAUDE.md`:

1. `npm run seed` en `abac-microservice/` (crea el super admin, genera `initial-credentials.json`)
2. `npm run micorner:seed` en `monolito-event-corner_v3/` (lee `initial-credentials.json` automáticamente)
3. `npm run seed:m2m` en `abac-microservice/` (registra las cuentas de servicio M2M)

## Notas

- El script **no** levanta MySQL/Docker ni Redis por vos — asume que ya están disponibles.
- Es idempotente: correr `npm run infra:up` con servicios ya arriba no rompe nada (pm2 hace `restart`/skip según corresponda).
- Si varias personas/procesos manejan pm2 en paralelo sobre el mismo daemon (`pm2 restart`, `pm2 delete` manuales mientras el script corre), vas a ver restarts en cadena o timeouts — no es un bug del script, es contención sobre el mismo daemon de pm2.
