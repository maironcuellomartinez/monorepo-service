# integration-service

Pasarela HTTP hacia sistemas externos que **no son ServiceNow**: inventario de dispositivos
(Minerva), lockers físicos (DropPoint) y calendario (Outlook / MS Graph). No comparte base de
datos ni cola con el resto del ecosistema — es un servicio sin estado (no tiene persistencia
propia), auth M2M vía ABAC.

Puerto: **3008** | Swagger: `http://localhost:3008/api/docs` (dev/staging) | Prefijo: `/api/v1`

> ServiceNow **no** pasa por acá. Ese egress es exclusivo de `api-gateway → api-snowq-service`.
> Ver la nota histórica al final de este documento si te encontrás código o docs viejas que
> digan lo contrario.

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Prerequisitos](#2-prerequisitos)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Arranque](#4-arranque)
5. [Autenticación](#5-autenticación)
6. [Endpoints](#6-endpoints)
7. [Resiliencia por conector](#7-resiliencia-por-conector)
8. [Observabilidad](#8-observabilidad)
9. [Tests](#9-tests)
10. [Nota histórica: qué se quitó y por qué](#10-nota-histórica-qué-se-quitó-y-por-qué)

---

## 1. Arquitectura general

```
monolith ──► api-gateway (/outbound/inventory/*) ──► integration-service :3008 ──► Minerva (solo lectura, SOAP)
                                                              │
                                                              └──► DropPoint (lockers, REST v5) — sin caller interno confirmado hoy
```

Clean Architecture por capas (`domain/ → application/ → infrastructure/ → presentation/`), pero
sin capa de persistencia: no hay TypeORM, no hay MySQL, no hay migraciones. Cada conector
resuelve su propio circuit breaker y política de reintentos en memoria (`BaseExternalConnector`),
no hay estado compartido entre requests.

**Conectores registrados** (`infrastructure/external/connectors/`):

| Conector | Protocolo/Auth | Expuesto vía HTTP | Consumido hoy por |
|---|---|---|---|
| `MinervaConnector` (+ `MinervaSoapClient`) | SOAP, X-API-Key | Sí — `MinervaController` | `api-gateway/InventoryOutboundController` (solo lectura) |
| `DroppointConnector` | REST v5, Basic Auth | Sí — `DroppointController` | Sin caller interno confirmado — tiene credenciales reales de prod configuradas, integración pendiente de conectar |
| `OutlookCalendarConnector` (+ `CalendarAdapter`) | MS Graph, `ClientSecretCredential` | **No** — registrado en el DI pero sin controller propio | Nadie todavía |

---

## 2. Prerequisitos

| Requisito | Versión mínima |
|---|---|
| Node.js | 20 LTS |
| `@nestjs/cli` global | 11.x |

No requiere base de datos ni Redis ni cola de mensajes.

```bash
npm install -g @nestjs/cli
npm install
```

---

## 3. Variables de entorno

Ver `.env.development` / `.env.staging` / `.env.production` (gitignored, no versionados).

| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTP (3008) |
| `ABAC_URL`, `ABAC_M2M_TOKEN` | Emisión/validación de tokens M2M contra ABAC |
| `ED25519_PUBLIC_KEY` | Clave pública de ABAC para verificar el JWT M2M (EdDSA) — ver [`InternalTokenGuard`](#5-autenticación) |
| `JWT_SECRET` | Fallback HS256 legado del mismo guard (algoritmo detectado por el header del JWT) |
| `MINERVA_SOAP_WSDL_URL`, `MINERVA_TIMEOUT` | Cliente SOAP de Minerva |
| `DROPPOINT_BASE_URL`, `DROPPOINT_USERNAME`, `DROPPOINT_PASSWORD`, `DROPPOINT_TIMEOUT` | Cliente REST de DropPoint |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | `OutlookCalendarConnector` (MS Graph) |
| `THROTTLER_TTL`, `THROTTLER_LIMIT` | Rate limiting global (`ThrottlerGuard`) |
| `CORS_ORIGIN`, `CORS_CREDENTIALS` | CORS |
| `SERVICE_NAME`, `LOG_TRANSPORT_URL`, `LOG_TRANSPORT_LEVEL`, `OBS_METRICS_URL` | Envío de logs/métricas a `observability-service` |

En staging/producción, `main.ts` valida al boot que `JWT_SECRET` y `ABAC_M2M_TOKEN` estén
configurados (no `CHANGE_ME`) — si falta alguno, el proceso no arranca.

---

## 4. Arranque

```bash
npm run start:dev     # watch mode, NODE_ENV=development
npm run build          # nest build (webpack)
npm run start:staging  # build + start con NODE_ENV=staging
npm run start:prod     # build + start con NODE_ENV=production
```

---

## 5. Autenticación

Todos los controllers (`Minerva`, `Droppoint`) están protegidos por `InternalTokenGuard`
(`shared/guards/internal-token.guard.ts`): requiere `Authorization: Bearer <JWT M2M>` emitido por
ABAC. Soporta dos algoritmos, detectados por el header del JWT:

- **EdDSA (Ed25519)** — algoritmo actual de ABAC, verificado con `ED25519_PUBLIC_KEY`.
- **HS256** — fallback legado, verificado con `JWT_SECRET`.

El token debe tener `type: 'service'` en el payload (cuenta M2M, no de usuario).

---

## 6. Endpoints

Prefijo global `/api/v1` (`setGlobalPrefix('api')` + `enableVersioning({ type: URI })`).

### Minerva (solo lectura)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/minerva/devices/:serial` | Dispositivo por número de serie |
| `GET` | `/minerva/users/:userId/devices` | Dispositivos asignados a un usuario |

### DropPoint

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/droppoint/boxes/free?machineRef=` | Lockers libres en una máquina |
| `GET` | `/droppoint/shipments/:externalId` | Detalle de un envío |
| `POST` | `/droppoint/shipments` | Crear envío (reserva un locker) |
| `PATCH` | `/droppoint/shipments/state` | Actualizar estado del envío |
| `DELETE` | `/droppoint/shipments/:externalId?machineRef=` | Cancelar envío (libera el locker) |

### Salud y métricas (sin auth)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | `memory_heap` únicamente — sin DB que pinguear |
| `GET` | `/health/readiness`, `/health/liveness` | Checks de K8s |
| `GET` | `/metrics` | Métricas Prometheus (`integration_service_*`) |

---

## 7. Resiliencia por conector

Cada conector que extiende `BaseExternalConnector` (`domain/interfaces/external-connector.interface.ts`)
trae su propio circuit breaker y política de reintentos **en memoria**, configurados en el
constructor (ver `DroppointConnector` como referencia: `failureThreshold`, `resetTimeout`,
`retryPolicy` con backoff exponencial + jitter). No hay estado persistido entre reinicios del
proceso — a diferencia de, por ejemplo, `api-snowq-service`, que sí persiste el estado del
breaker en DB.

---

## 8. Observabilidad

- **Logs**: Winston con rotación diaria + transporte HTTP hacia `observability-service`
  (`LOG_TRANSPORT_URL`), con circuit breaker propio.
- **Trazas**: `TracingService` (`infrastructure/monitoring/tracing.service.ts`), envuelve
  operaciones relevantes de cada connector/controller.
- **Métricas**: `prom-client` expuesto en `GET /api/v1/metrics` — contadores de requests,
  duración, estado de circuit breakers y errores por sistema.
- **Correlation ID**: `CorrelationMiddleware` + `CorrelationIdService`, propagado en headers
  salientes (`x-correlation-id`).

---

## 9. Tests

```bash
npm test        # unit (Jest, rootDir src, *.spec.ts)
npm run test:e2e # e2e (*.e2e-spec.ts)
npm run test:cov
```

---

## 10. Nota histórica: qué se quitó y por qué

Hasta julio de 2026 este servicio tenía bastante más superficie de la que aparenta hoy:

- **Un flujo completo de ServiceNow** (`ServiceNowController`, conectores dedicados) que
  duplicaba innecesariamente el camino real (`api-gateway → api-snowq-service`). Se eliminó el
  2026-07-09 al consolidar ese egress directamente en el gateway.
- **Un flujo de `appointments`** (`IntegrationEvent`/`ExternalSystem` con event sourcing y
  circuit breaker persistidos en MySQL vía TypeORM, más `CqrsModule`/`EventEmitterModule`/
  `ScheduleModule`) que quedó sin ningún caller real tras esa consolidación — el proxy que lo
  exponía en `api-gateway` ya no existe. Se eliminó el 2026-07-28 junto con **toda la capa de
  persistencia** del servicio (era su único consumidor): no hay MySQL, no hay TypeORM, no hay
  migraciones.
- **Rutas de `MinervaController`** sin caller (listado de dispositivos, asignar, liberar) —
  la asignación de dispositivos a un usuario es hoy una operación local del monolito
  (`Device.assignToUser()`), nunca pasa por HTTP hacia acá. Se eliminaron junto con los métodos
  huérfanos del conector y del cliente SOAP.

Si necesitás reintroducir algo con estado (retries persistidos, event sourcing, asignación de
dispositivos vía Minerva), hay que traer esa infraestructura de nuevo desde cero — no quedó
nada de lo anterior.

DropPoint y `OutlookCalendarConnector` **no** se tocaron en esta limpieza — DropPoint tiene
credenciales reales de producción configuradas (señal de integración pendiente de conectar, no
código muerto confirmado) y Outlook nunca tuvo controller propio.
