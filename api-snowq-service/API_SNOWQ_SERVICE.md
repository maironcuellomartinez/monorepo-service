# api-snowq-service

Cola inteligente + circuit breaker + bulkhead entre el ecosistema **Event Corner** y **ServiceNow**.
Absorbe picos de tráfico, protege a ServiceNow de sobrecarga, y distingue entre fuentes de negocio
(monolith) y fuentes de monitoreo (Nagios/Thruk) con deduplicación y TTL dedicados para estas últimas.

Puerto: **3090** | Swagger: `http://localhost:3090/docs` (dev/staging, no en producción)

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Prerequisitos](#2-prerequisitos)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Arranque](#4-arranque)
5. [Autenticación](#5-autenticación)
6. [Endpoints](#6-endpoints)
7. [Flujo: solicitud estándar (cola)](#7-flujo-solicitud-estándar-cola)
8. [Flujo: alertas de monitoreo (Nagios/Thruk)](#8-flujo-alertas-de-monitoreo-nagiosthruk)
9. [Resiliencia](#9-resiliencia)
10. [Manejo de errores y reintentos](#10-manejo-de-errores-y-reintentos)
11. [Jobs programados](#11-jobs-programados)
12. [Esquema de tablas](#12-esquema-de-tablas)
13. [Troubleshooting y deuda técnica conocida](#13-troubleshooting-y-deuda-técnica-conocida)

---

## 1. Arquitectura general

```
monolith / api-gateway ──┐
                          │  POST /snow-requests/{type}        (async, 202)
                          │  POST /snow-requests/immediate/*   (sync, 200/201)
                          │  GET  /snow-requests/:correlationId  ← polling de estado
Nagios/Thruk         ─────┤
                          │  POST /monitoring/alerts           (dedup + TTL + recovery)
                          ▼
                  api-snowq-service :3090
                          │
              ┌───────────┼────────────────┐
              ▼           ▼                ▼
      BulkheadMiddleware  MySQL          Circuit Breaker
      (gate por ruta)   snow_requests    (3 breakers: immediate/monitoring/queue)
              │           │                │
              ▼           ▼                ▼
      BulkheadInterceptor │         ServiceNowClientService
      (gate por cliente)  │                │
              │           │       Authorization: Basic | Bearer (OAuth2)
              └─────► SnowRequestWorkerService (poll 500ms) ──┘
                                                               ▼
                                        BulkheadRegistry.getForServiceNow()
                                        (8 concurrent / 40 queue / 15s timeout)
                                                               ▼
                                        ServiceNow REST API (o servicenow-clone-backend en dev)
```

**Dos vías de entrada distintas, mismo backend de cola:**
- **Estándar** (`/snow-requests/*`) — para aplicaciones de negocio (monolith). Sin deduplicación ni TTL, cada request es un ticket.
- **Monitoreo** (`/monitoring/*`) — para Nagios/Thruk. Filtra ruido (ACK/DOWNTIME/FLAPPING/SOFT), deduplica por `fingerprint` (host+service), y cancela tickets pendientes ante un RECOVERY.

---

## 2. Prerequisitos

| Requisito | Versión mínima |
|---|---|
| Node.js | 20 LTS |
| MySQL | 8.x (mismo servidor que el resto del ecosistema, DB `incidences_dbase`) |
| `@nestjs/cli` global | 11.x |

```bash
npm install -g @nestjs/cli
```

---

## 3. Variables de entorno

### Base de datos, puerto y ecosistema

| Variable | Requerida | Descripción | Default dev |
|---|---|---|---|
| `PORT` | no | Puerto HTTP | `3090` |
| `HOST` | no | Bind address (`127.0.0.1` en staging/prod — solo api-gateway es público) | `0.0.0.0` |
| `HOST_DATABASE` / `PORT_DATABASE` / `USERNAME_DATABASE` / `PASSWORD_DATABASE` / `DATABASE_DATABASE` | sí (staging/prod) | Conexión MySQL | `localhost` / `3306` / `root` / `root` / `incidences_dbase` |
| `SYNCHRONIZE_DATABASE` | no | TypeORM sync automático (**solo dev**) | `true` |
| `ED25519_PUBLIC_KEY` | sí | Verifica JWT M2M entrantes (misma clave que el resto del ecosistema) | — |
| `JWT_ISSUER` | no | Issuer esperado en tokens M2M | `abac-service` |
| `ABAC_M2M_TOKEN` | sí (solo boot) | Validado al arrancar; no se usa en el resto del código actualmente | — |
| `ABAC_URL` / `ABAC_APP_ID` | no | Referencia del ecosistema ABAC (no consumidos directamente por este servicio hoy) | — |

### ServiceNow — destino y auth saliente

| Variable | Requerida | Descripción | Default dev |
|---|---|---|---|
| `BASE_URL_SERVICENOW` | sí | URL base de ServiceNow (`http://localhost:3010` = simulador local) | `http://localhost:3010` |
| `SN_AUTH_MODE` | no | `basic` (default) o `oauth2` — ver [sección 5.2](#52-outbound-hacia-servicenow-basic--oauth2) | `basic` |
| `SN_AUTH` | sí si `SN_AUTH_MODE=basic` | Credenciales Basic Auth, ya en base64 (`user:pass`) | *(vacío en dev)* |
| `SN_OAUTH_URL` | sí si `SN_AUTH_MODE=oauth2` | Endpoint token OAuth2 de ServiceNow | — |
| `SN_OAUTH_UPN` | sí si `oauth2` | UPN de la cuenta de servicio en ServiceNow (claim `sub`) | — |
| `SN_OAUTH_KID` | sí si `oauth2` | Key ID del certificado registrado en ServiceNow (header JWT `kid`) | — |
| `SN_OAUTH_CLIENT_ID` | sí si `oauth2` | Client ID de la app OAuth2 (claim `aud` + `client_id`) | — |
| `SN_OAUTH_CLIENT_SECRET` | no | Opcional — solo si ServiceNow lo exige junto a la assertion JWT | — |
| `SN_OAUTH_ISS` | sí si `oauth2` | Issuer (`iss`) de la JWT assertion | — |
| `SN_OAUTH_GRANT_TYPE` | no | Grant type OAuth2 | `urn:ietf:params:oauth:grant-type:jwt-bearer` |
| `SN_OAUTH_CERT_PATH` | sí si `oauth2` | Ruta al `.pem` (clave privada) usado para firmar la JWT assertion | — |

### Reconciler, archivado y observabilidad

| Variable | Requerida | Descripción | Default |
|---|---|---|---|
| `RECONCILER_ENABLED` | no | Activa `MonitoringReconcilerService` (poll directo a ServiceNow para auto-cerrar tickets de Nagios) | `false` |
| `RECONCILER_INTERVAL_SECONDS` | no | Intervalo entre pasadas (mínimo 30) | `300` |
| `RECONCILER_BATCH_SIZE` | no | Tickets `DELIVERED` sin resolver a chequear por pasada | `20` |
| `ARCHIVE_RETENTION_DAYS` | no | Días antes de mover registros terminales a `snow_requests_archive` | `30` |
| `LOG_TRANSPORT_URL` | no | Endpoint de ingesta de logs de `observability-service` | `http://localhost:3099/ingest/logs` |
| `OBS_METRICS_URL` | no | Endpoint de ingesta de métricas | `http://localhost:3099/ingest/metrics` |
| `OBS_TRACES_URL` | no | Endpoint de ingesta de trazas | `http://localhost:3099/ingest/traces` |
| `SERVICE_NAME` | no | Nombre reportado a observability-service | `api-snowq-service` |

> **Nota:** `main.ts` (`validateConfig()`) hace fail-fast en staging/producción si falta cualquiera de
> las variables marcadas "sí" — según `SN_AUTH_MODE`, exige el bloque `SN_AUTH` (basic) o el bloque
> `SN_OAUTH_*` (oauth2), nunca ambos.

---

## 4. Arranque

### Desarrollo (hot-reload, apunta al simulador local de ServiceNow)

```bash
cd api-snowq-service
npm install
npm run start:dev
```

### Staging / producción

```bash
npm run build
npm run start:staging    # o start:prod
```

### Verificar arranque

```bash
curl http://localhost:3090/health/live
curl http://localhost:3090/health/ready
```

---

## 5. Autenticación

### 5.1 Inbound (requests hacia este servicio)

`M2mJwtGuard` (`src/common/guards/m2m-jwt.guard.ts`) — patrón estándar del ecosistema: JWT M2M
firmado con Ed25519, verificado localmente con `ED25519_PUBLIC_KEY` (sin llamada de red), exige
`payload.type === 'service'` e `iss === JWT_ISSUER`.

Aplicado a nivel de controller en: `HealthController` (solo `/health/status`), `ResilienceController`,
`SnowRequestQueueController`, `SnowRequestImmediateController`.

**`MonitoringController` no tiene guard** — Thruk/Nagios le pega directo sin JWT. El aislamiento es
de red (host de monitoreo confiable), no de aplicación.

### 5.2 Outbound hacia ServiceNow (Basic / OAuth2)

`ServiceNowClientService.getAuthHeader()` decide el header `Authorization` en cada una de las 7
rutas salientes según `SN_AUTH_MODE`:

```
SN_AUTH_MODE=oauth2  →  Authorization: Bearer <access_token>   (JWT Bearer grant, RFC 7523)
cualquier otro valor →  Authorization: Basic <SN_AUTH>          (legado, default)
```

**Modo `oauth2`** — `ServiceNowTokenService` (`src/servicenow/client/servicenow-token.service.ts`):

1. Firma una JWT assertion (`RS256`, `kid` en el header) con el `.pem` de `SN_OAUTH_CERT_PATH`, claims `aud`/`sub`/`iss`/`jti`/`exp`.
2. La intercambia por un access token contra `SN_OAUTH_URL` (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`).
3. **Cachea** el token en memoria hasta 30s antes de `expires_in` — no repite el intercambio en cada request saliente.
4. Si dos requests concurrentes encuentran el token vencido, comparten el mismo refresh en vuelo (sin refrescos duplicados).
5. Si el intercambio falla, lanza `ServiceNowAuthError` (401) — no devuelve un header con `Bearer undefined`.

```
Convivencia por ambiente:
  dev      → SN_AUTH_MODE=basic   (el simulador local no valida auth de todos modos)
  staging  → SN_AUTH_MODE=oauth2  (requiere .pem + SN_OAUTH_* reales en el .env del server)
  prod     → SN_AUTH_MODE=oauth2
```

---

## 6. Endpoints

Sin prefijo global (`main.ts` no llama `setGlobalPrefix`).

### 6.1 Health (`/health`, sin guard salvo donde se indica)

| Método | Ruta | Guard | Descripción |
|---|---|---|---|
| GET | `/health/live` | — | Liveness probe |
| GET | `/health/ready` | — | Readiness probe (DB) |
| GET | `/health/status` | M2M | Estado detallado: DB, resumen circuit breakers, tamaño de cola |

### 6.2 Resilience (`/resilience`, M2M en todas)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/resilience/circuit-breaker/status` | Métricas de los 3 breakers + cuántos están abiertos |
| GET | `/resilience/bulkhead/status` | Métricas de bulkhead + lista de sobrecargados |
| POST | `/resilience/circuit-breaker/reset` | Resetea todos los breakers manualmente |

### 6.3 Monitoring — Nagios/Thruk (`/monitoring`, sin guard)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/monitoring/alerts` | Entrada única para notificaciones de Nagios (crea/deduplica/cancela según tipo, ver [sección 8](#8-flujo-alertas-de-monitoreo-nagiosthruk)). Siempre `200`. |
| POST | `/monitoring/cancel/:fingerprint` | Cancelación explícita por fingerprint, alternativa a un RECOVERY |

### 6.4 Snow Requests — modo cola / asíncrono (`/snow-requests`, M2M + Bulkhead)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/snow-requests/incidents` \| `change-requests` \| `problems` \| `service-catalog` \| `knowledge-articles` \| `release-tasks` \| `configuration-items` | Encola una solicitud (`202` + `correlationId`) |
| GET | `/snow-requests/all` | Últimos 100 registros, cualquier estado (dashboard) |
| GET | `/snow-requests/delivered` | Registros `DELIVERED` |
| GET | `/snow-requests/:correlationId` | Estado de una solicitud — **endpoint que consume el `ReconcilerJob` del monolith** |

### 6.5 Snow Requests — modo inmediato / síncrono (`/snow-requests/immediate`, M2M + Bulkhead)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/incidents` \| `change-requests` \| `problems` \| `service-catalog` \| `knowledge-articles` \| `release-tasks` \| `configuration-items` | Crea el ticket en ServiceNow **en la misma request** (sin cola) |
| GET | `/incidents/:sysId` | Estado del ticket directo desde ServiceNow (404 si no existe) |
| PATCH | `/incidents/:sysId/close` | Cierra el incidente (`204`) |
| PATCH | `/:table/:sysId` | Update genérico de campos arbitrarios en cualquier tabla `RequestType` |
| GET | `/companies` \| `/companies/:sysId` \| `/groups` \| `/groups/:sysId` | Catálogos de ServiceNow (empresas / grupos de asignación) |

### 6.6 DLQ — dentro de `/snow-requests` (M2M)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/snow-requests/failed` | Listado de registros `FAILED` |
| GET | `/snow-requests/dlq/stats` | Total, por tipo, por prioridad, top-10 patrones de error, más antiguo/reciente |
| POST | `/snow-requests/failed/retry-all` | Reencola **todos** los `FAILED` (reset `retryCount`/`nextRetryAt`/`lastError`) |
| POST | `/snow-requests/failed/retry` | Reencola `FAILED` filtrados por `{type, source, since, until}` |
| POST | `/snow-requests/failed/:correlationId/retry` | Reencola un registro puntual |
| DELETE | `/snow-requests/failed` | Descarta (`DISCARDED`) `FAILED` filtrados |
| DELETE | `/snow-requests/failed/:correlationId` | Descarta un registro puntual |

> `retry-all` está declarado antes de `:correlationId/retry` en el controller — necesario para que Nest no lo trate como un `correlationId` literal.

---

## 7. Flujo: solicitud estándar (cola)

```
monolith → POST /snow-requests/incidents
              │  sin fingerprint, sin TTL
              ▼
    SnowRequestProcessingService.enqueue()
              │  INSERT snow_requests (status=QUEUED)
              ▼  respuesta inmediata: 202 { correlationId }
    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    SnowRequestWorkerService (poll cada 500ms, batch=20)
              │  findPendingQueue() ordenado por prioridad de tipo + createdAt
              │  markAsProcessing() → status=IN_PROGRESS
              ▼
    BulkheadRegistry.getForServiceNow() (8 concurrent / 40 queue / 15s)
              ▼
    CircuitBreaker sn:queue → ServiceNowClientService → ServiceNow
              │
      ┌───────┴────────┐
      ▼                ▼
   200 OK          error (ver sección 10)
      │                │
 DELIVERED      markAsRetry() → QUEUED+backoff   |   markAsFailed() → FAILED (DLQ)
```

El monolith hace polling de `GET /snow-requests/:correlationId` (su `MonolithReconcilerJob`, cada 30s)
hasta ver `DELIVERED` (guarda `sysId`/`snowNumber`) o `FAILED`.

**Recuperación al reiniciar:** si el proceso muere con registros en `IN_PROGRESS`, al arrancar
`SnowRequestService.recoverStuckProcessing()` vuelve a `QUEUED` cualquier fila `IN_PROGRESS` con
`updatedAt` de más de 5 minutos, para que el worker la retome.

---

## 8. Flujo: alertas de monitoreo (Nagios/Thruk)

```
Thruk → POST /monitoring/alerts { notificationType, host, service, state, stateType, ttlSeconds, ... }
              │
              ▼
        ¿Es ignorable?
        ├─ ACKNOWLEDGEMENT           → IGNORED (alguien ya lo atiende)
        ├─ FLAPPINGSTART/STOP        → IGNORED (servicio inestable, no confirmado)
        ├─ DOWNTIME*                 → IGNORED (mantenimiento programado)
        └─ PROBLEM + stateType=SOFT  → IGNORED (falla aún no confirmada)
              │
              ▼ (solo PROBLEM HARD y RECOVERY continúan)
        ¿Es RECOVERY?
        ├─ SÍ → cancelByFingerprint()
        │        ├─ QUEUED        → CANCELLED
        │        ├─ IN_PROGRESS   → TOO_LATE (ya se estaba enviando a SN)
        │        └─ no encontrado → IGNORED
        │
        └─ NO (PROBLEM HARD)
                 ▼
        ¿Existe QUEUED/IN_PROGRESS con el mismo fingerprint (host+service)?
        ├─ SÍ → DEDUPLICATED (devuelve el correlationId existente, no crea otro registro)
        └─ NO → INSERT con fingerprint + expiresAt(ttlSeconds) → QUEUED
```

**Por qué siempre se encola (nunca modo inmediato) para monitoreo:** la ventana entre "Thruk avisa"
y "el worker despacha a SN" es lo que permite:
- **TTL/expiración** — si el servicio se recupera antes de que el worker despache, el registro
  expira (`EXPIRED`) sin llegar nunca a ServiceNow (chequeo throttled cada ~30s dentro del loop del worker).
- **Cancelación por recovery** — solo funciona porque el ticket sigue en `QUEUED` cuando llega el RECOVERY.
- **Backpressure ante tormenta** — 40 hosts caídos por el mismo switch generan 40 notificaciones,
  pero deduplicación por fingerprint crea **un solo** ticket en ServiceNow.

**Nota sobre el hash de fingerprint:** para monitoreo se hashea solo `{host, service}`, deliberadamente
sin incluir `state` — si se incluyera, `WARNING` y `CRITICAL` del mismo host/servicio generarían
tickets distintos, rompiendo la deduplicación.

Para solicitudes estándar (`/snow-requests/*`), el fingerprint (cuando el payload trae
`incidentId`/`requestId`/`externalId`) sirve como garantía de idempotencia general: un reenvío
accidental del mismo `incidentId` devuelve el `correlationId` existente en vez de duplicar el ticket.

---

## 9. Resiliencia

### 9.1 Bulkhead (3 capas independientes)

| Capa | Alcance | Límites |
|---|---|---|
| `BulkheadMiddleware` | `/monitoring/*` | 30 concurrentes / cola 200 / timeout 5s |
| `BulkheadMiddleware` | `/snow-requests/immediate/*` | 10 concurrentes / cola 20 / timeout 30s |
| `BulkheadMiddleware` | `/snow-requests/*` (resto) | 30 concurrentes / cola 200 / timeout 5s |
| `BulkheadInterceptor` | por cliente (`x-client-id` header) + endpoint | 5 concurrentes / cola 20 |
| `BulkheadRegistry.getForServiceNow()` | llamada saliente a ServiceNow (usada tanto en modo inmediato como por el worker) | 8 concurrentes / cola 40 / timeout 15s |

Tres responsabilidades distintas: el middleware es un gate global por tipo de ruta (antes del
handler), el interceptor aísla clientes individuales entre sí, y el registry protege a ServiceNow
como recurso compartido independientemente de cuánto tráfico entrante haya.

### 9.2 Circuit breaker (3 breakers nombrados)

`ServiceNowBreakerFactory` elige el breaker según el origen de la solicitud:

```ts
if (entity.immediate)                return breaker('sn:immediate');
if (entity.source === 'nagios-thruk') return breaker('sn:monitoring');
return breaker('sn:queue');
```

| Breaker | Umbral de falla | Mínimo de llamadas | Ventana | Timeout de apertura |
|---|---|---|---|---|
| `sn:immediate` | 50% | 3 | 5 | 15s |
| `sn:monitoring` | 60% | 5 | 10 | 30s |
| `sn:queue` | 50% | 5 | 10 | 30s |

Los tres excluyen `ServiceNowFatalError` y `ServiceNowAuthError` del conteo de fallas — solo errores
5xx/timeouts/temporales abren el breaker; un 400/401/403 es un problema del payload o de
credenciales, no de disponibilidad de ServiceNow.

### 9.3 Circuit breaker abierto → comportamiento

Si el breaker está abierto, la llamada nunca sale hacia ServiceNow: se lanza `CircuitBreakerOpenError`,
que en el worker se trata igual que un error temporal (`markAsRetry()`, ver sección 10).

---

## 10. Manejo de errores y reintentos

`ServiceNowErrorFactory` clasifica cualquier respuesta HTTP de ServiceNow:

```
4xx (400/404/422/...)  → ServiceNowFatalError    (payload inválido, no tiene sentido reintentar)
401 / 403               → ServiceNowAuthError     (credenciales/token, no tiene sentido reintentar)
408 / 429 / 5xx          → ServiceNowTemporalError (transitorio, reintentar con backoff)
```

**Camino asíncrono (worker)** — `SnowRequestQueueService._processRequest()`:

| Excepción capturada | Acción |
|---|---|
| `CircuitBreakerOpenError` | `markAsRetry()` — SN no disponible, reintenta con backoff |
| `ServiceNowTemporalError` | `markAsRetry()`, respetando `Retry-After` si vino en un 429 |
| Cualquier otra (`Fatal`/`Auth`/inesperada) | `markAsFailed()` — directo a DLQ, sin reintentos |

**Camino inmediato (síncrono)** — usa `@backendkit-labs/retry` en vez de la cola: máximo 2 intentos,
backoff fijo de 500ms, y aborta sin reintentar si el error no es `ServiceNowTemporalError` (misma
separación fatal-vs-temporal, mecanismo distinto).

### Backoff exponencial + jitter por prioridad (`RequestPriorityUtils.getRetryDelay`)

```
delay = clamp(base × 2^retryCount, techo) × random(0.5, 1.0)   ← "equal jitter"
```

| Prioridad | Base | Techo | Máx. reintentos antes de `FAILED` |
|---|---|---|---|
| CRITICAL | 30s | 2 min | 20 (~40–60 min de ventana total) |
| HIGH | 30s | 5 min | 12 |
| MEDIUM | 30s | 10 min | 8 |
| LOW | 60s | 30 min | 5 |

Lo crítico tiene más persistencia (más reintentos) aunque el backoff base sea igual — la ventana
total de reintento termina siendo mucho mayor para `CRITICAL` que para `LOW`.

---

## 11. Jobs programados

| Mecanismo | Tipo | Frecuencia | Qué hace |
|---|---|---|---|
| `SnowRequestWorkerService` (poll loop) | `setTimeout`/`setImmediate` propio | 500ms (inmediato si el batch anterior no estaba vacío) | Despacha `QUEUED` → `IN_PROGRESS` → ServiceNow, batch=20 |
| Chequeo de expiración | inline dentro del poll loop, autothrottled | ~cada 30s | `expireOverdue()`: `QUEUED` con `expiresAt` vencido → `EXPIRED` |
| `MonitoringReconcilerService` | `setInterval` propio | `RECONCILER_INTERVAL_SECONDS` (default 300s), **solo si `RECONCILER_ENABLED=true`** | Para tickets `DELIVERED` de Nagios sin `resolvedAt`: consulta el estado en ServiceNow directamente y marca `resolvedAt` si está cerrado |
| `SnowRequestArchiveJob` | `@Cron` (`@nestjs/schedule`) | Diario a las 02:00 | Mueve registros terminales (`DELIVERED`/`DISCARDED`/`CANCELLED`/`EXPIRED`) con más de `ARCHIVE_RETENTION_DAYS` a `snow_requests_archive`, en lotes de 500 |
| Emisor de gauge `snow_queue_size` | `setInterval` propio | 15s | Métrica de tamaño de cola hacia observability-service |

---

## 12. Esquema de tablas

### `snow_requests` — la cola

Columnas clave: `id` (PK), `correlationId` (unique), `internalNumber` (unique, `SNQ-XXXXXXXX`),
`type` (enum `RequestType`), `priority`, `payload` (json), `sysId?`, `snowNumber?`,
`status` (enum: `QUEUED` \| `IN_PROGRESS` \| `DELIVERED` \| `FAILED` \| `CANCELLED` \| `EXPIRED` \| `DISCARDED`),
`source`, `immediate` (bool), `fingerprint?` (varchar 512, dedup), `expiresAt?` (TTL),
`retryCount`, `maxRetries`, `nextRetryAt?`, `lastError?`, `resolvedAt?`, `createdAt`, `updatedAt`.

Índices: `(status, nextRetryAt)`, `(fingerprint, status)`, `(status, updatedAt)`, `(status, expiresAt)`.

### `snow_request_logs`

`id`, `snowRequestId`, `correlationId`, `action` (enum `Action`), `statusCode?`, `message?`, `createdAt`.

### `snow_requests_archive`

Espejo de `snow_requests` + `originalId` (referencia al registro original) + `archivedAt`.
Índices: `(correlationId)`, `(status, archivedAt)`.

### Mapeo `RequestType` → tabla/endpoint de ServiceNow

| RequestType | Tabla SN | Endpoint |
|---|---|---|
| `incident` | `incident` | `/api/now/v2/incident` |
| `change_request` | `change_request` | `/api/now/v2/change_request` |
| `sc_req_item` | `sc_req_item` | `/api/now/v2/sc_req_item` |
| `problem` | `problem` | `/api/now/v2/problem` |
| `kb_article` | `kb_article` | `/api/now/v2/kb_article` |
| `release_task` | `release_task` | `/api/now/v2/release_task` |
| `cmdb_ci` | `cmdb_ci` | `/api/now/v2/cmdb_ci` |

---

## 13. Troubleshooting y deuda técnica conocida

### `SN_AUTH_MODE=oauth2` pero da 401 al arrancar

`validateConfig()` en `main.ts` exige todas las `SN_OAUTH_*` (excepto `SECRET` y `GRANT_TYPE`, que
son opcionales) cuando `SN_AUTH_MODE=oauth2`. Revisar que el `.env.<entorno>` real del server tenga
los valores reales, no los placeholders `CHANGE_ME` del repo, y que `SN_OAUTH_CERT_PATH` apunte a un
`.pem` que el proceso pueda leer.

### Un ticket de Nagios nunca se cierra automáticamente

`MonitoringReconcilerService` está desactivado por default (`RECONCILER_ENABLED=false`). Sin él,
los tickets `DELIVERED` originados en `/monitoring/alerts` nunca se marcan `resolvedAt`, aunque se
cierren manualmente en ServiceNow.

### Circuit breaker abierto todo el tiempo

`GET /resilience/circuit-breaker/status` muestra el estado de los 3 breakers. Si `sn:queue` está
abierto de forma persistente, revisar conectividad real a `BASE_URL_SERVICENOW` — el breaker no
distingue entre "ServiceNow caído" y "credenciales rotas que igual devuelven 5xx" salvo que el error
sea clasificado explícitamente como `ServiceNowAuthError` (401/403).

### Deuda técnica conocida (no bloqueante, documentada para no reinvestigarla)

- **`src/legacy/broker-client/`** — cliente TCP hacia un broker, no está importado en `app.module.ts`
  ni en ningún otro módulo. Código huérfano de una arquitectura anterior (pre-worker). Sus env vars
  (`BROKER_HOST`, `BROKER_PORT`) no tienen efecto en el servicio actual.
- **`ABAC_M2M_TOKEN`** se valida como requerido al boot pero no se lee en ningún otro punto del
  código — probablemente vestigial o reservado para un uso futuro no implementado aún.
- **`routesServiceNow` / `requestTypeConfig`** en `src/common/config/environment.config.ts` — bloques
  `registerAs` con variables tipo `INCIDENT_PATH_SERVICEMOW` que no tiene ningún consumidor; el
  mapeo real vive hardcodeado en `RequestTypeUtils.TableEndpoints` (ver tabla de la sección 12).
