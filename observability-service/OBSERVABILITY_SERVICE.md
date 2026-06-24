# observability-service

Servicio centralizado de observabilidad para el ecosistema **Event Corner**.  
Actúa como sink unificado: recibe logs, trazas y métricas de todos los servicios,
los almacena en MySQL y —cuando estén disponibles— los reenvía a Jaeger/Prometheus.

Puerto: **3099** | Swagger: `http://localhost:3099/docs` (dev/staging)

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Prerequisitos](#2-prerequisitos)
3. [Configuración de la base de datos](#3-configuración-de-la-base-de-datos)
4. [Variables de entorno](#4-variables-de-entorno)
5. [Arranque](#5-arranque)
6. [Conectar servicios existentes](#6-conectar-servicios-existentes)
7. [API de ingesta](#7-api-de-ingesta)
8. [API de consulta](#8-api-de-consulta)
9. [Retención automática de datos](#9-retención-automática-de-datos)
10. [Modo híbrido (Jaeger / Prometheus)](#10-modo-híbrido-jaeger--prometheus)
11. [Esquema de tablas](#11-esquema-de-tablas)
12. [Flujo completo de un correlationId](#12-flujo-completo-de-un-correlationid)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Arquitectura general

```
api-gateway  :3000  ──┐
monolith     :3001  ──┤  POST /ingest/logs      (WinstonHttpTransport)
abac         :3005  ──┤  POST /ingest/traces     (OTLP/HTTP JSON)
api-snowq    :3090  ──┘  POST /ingest/metrics

                         observability-service :3099
                              │
                              ▼
                         MySQL  observability_db
                         ├── obs_log_entries
                         ├── obs_trace_spans
                         └── obs_metric_points

                         GET /query/logs
                         GET /query/traces
                         GET /query/metrics

                         (futuro)
                         ├──► Jaeger   JAEGER_OTLP_URL
                         └──► Prometheus PROMETHEUS_PUSHGATEWAY_URL
```

**Principio de diseño:**
- La ingesta es **pública** (`@Public()`): los servicios no necesitan token para enviar datos.
- La consulta requiere **token M2M Ed25519** (`Bearer <JWT>`) para proteger la lectura de datos internos.
- El reenvío a backends externos es **fire-and-forget**: un fallo en Jaeger/Prometheus no afecta la ingesta ni al servicio origen.

---

## 2. Prerequisitos

| Requisito | Versión mínima |
|---|---|
| Node.js | 20 LTS |
| MySQL | 8.x (mismo servidor que el resto del ecosistema) |
| `@nestjs/cli` global | 11.x |

```bash
npm install -g @nestjs/cli
```

---

## 3. Configuración de la base de datos

Ejecutar **una sola vez** desde MySQL (mismo servidor que `event_corner`, `abac_db`, etc.):

```sql
CREATE DATABASE IF NOT EXISTS observability_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
```

Con `DB_SYNCHRONIZE=true` (development), TypeORM crea las tablas automáticamente al arrancar.  
En staging/producción, poner `DB_SYNCHRONIZE=false` y aplicar las migraciones manualmente
(ver [Esquema de tablas](#11-esquema-de-tablas)).

---

## 4. Variables de entorno

Copiar `.env.development` como base para otros entornos.

| Variable | Requerida | Descripción | Default dev |
|---|---|---|---|
| `PORT` | sí | Puerto HTTP | `3099` |
| `NODE_ENV` | sí | `development` / `staging` / `production` | `development` |
| `DB_HOST` | sí | Host MySQL | `localhost` |
| `DB_PORT` | no | Puerto MySQL | `3306` |
| `DB_USERNAME` | sí | Usuario MySQL | `root` |
| `DB_PASSWORD` | sí | Contraseña MySQL | — |
| `DB_DATABASE` | sí | Nombre de la base de datos | `observability_db` |
| `DB_SYNCHRONIZE` | no | Sincronizar esquema al arrancar (**solo dev**) | `true` |
| `ED25519_PUBLIC_KEY` | sí | Clave pública Ed25519 en Base64 (misma que el resto del ecosistema) | — |
| `JWT_ISSUER` | no | Issuer esperado en tokens M2M | `abac-service` |
| `LOG_RETENTION_DAYS` | no | Días a conservar logs | `30` |
| `TRACE_RETENTION_DAYS` | no | Días a conservar trazas | `7` |
| `METRIC_RETENTION_DAYS` | no | Días a conservar métricas | `14` |
| `JAEGER_OTLP_URL` | no | Endpoint OTLP de Jaeger (vacío = desactivado) | — |
| `PROMETHEUS_PUSHGATEWAY_URL` | no | Endpoint Pushgateway (vacío = desactivado) | — |

> **Nota:** `ED25519_PUBLIC_KEY` es la misma clave que tienen `api-gateway`, `monolith` y `api-snowq-service`.
> No se genera aquí: se obtiene del ecosistema ABAC.

---

## 5. Arranque

### Desarrollo (hot-reload)

```bash
cd observability-service
npm install
npm run start:dev
```

### Con PM2 (desde el monorepo)

El servicio está registrado en `monolito-event-corner_v3/ecosystem.config.js`.

```bash
cd monolito-event-corner_v3

# Arrancar junto al resto del ecosistema
npm run pm2:dev

# O solo observability-service
pm2 start ecosystem.config.js --env development --only observability-service
```

### Verificar arranque

```bash
curl http://localhost:3099/health
# {"status":"ok","db":"ok","uptime":12.34}
```

---

## 6. Conectar servicios existentes

Los servicios que usan `LoggerService` de `@app/observability` ya tienen `WinstonHttpTransport` integrado.
Solo hace falta añadir la variable en cada `.env.*`:

```dotenv
# apps/api-gateway/.env.development
# apps/monolith/.env.development
# ../api-snowq-service/.env.development
LOG_TRANSPORT_URL=http://localhost:3099/ingest/logs
```

> **Ya está hecho** para los entornos development. Replicar en `.env.staging` y `.env.production`
> con la URL correcta para cada entorno.

### Servicios que envían logs automáticamente

| Servicio | Transport activo |
|---|---|
| api-gateway | `WinstonHttpTransport` via `@app/observability` |
| monolith | `WinstonHttpTransport` via `@app/observability` |
| api-snowq-service | `LoggerService` local con `WinstonHttpTransport` |
| abac-microservice | Pendiente (añadir `LOG_TRANSPORT_URL` a su `.env.*`) |

### Añadir observabilidad a abac-microservice

```dotenv
# abac-microservice/.env.development
LOG_TRANSPORT_URL=http://localhost:3099/ingest/logs
SERVICE_NAME=abac-microservice
```

Si `abac-microservice` usa su propio logger, configurar el transport HTTP apuntando al mismo endpoint.

---

## 7. API de ingesta

Todos los endpoints de ingesta son **públicos** (no requieren Authorization header).

### 7.1 Logs — `POST /ingest/logs`

Formato compatible con `WinstonHttpTransport` del ecosistema.

```bash
curl -X POST http://localhost:3099/ingest/logs \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "level": "info",
        "message": "Incident created successfully",
        "service": "monolith",
        "timestamp": "2026-04-06T10:00:00.000Z",
        "correlationId": "a1b2c3d4-e5f6-...",
        "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
        "spanId": "00f067aa0ba902b7",
        "context": "IncidentService"
      }
    ],
    "batchSize": 1
  }'
```

Respuesta: `202 Accepted` — `{ "saved": 1 }`

**Campos del log:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `level` | `error\|warn\|info\|http\|debug\|verbose` | sí | Nivel de log |
| `message` | string | sí | Mensaje |
| `service` | string | sí | Nombre del servicio origen |
| `timestamp` | ISO 8601 | sí | Timestamp del evento |
| `correlationId` | string (UUID) | no | ID de correlación de la request |
| `traceId` | string (hex 32) | no | Trace ID OpenTelemetry |
| `spanId` | string (hex 16) | no | Span ID OpenTelemetry |
| `context` | string | no | Clase/módulo NestJS |
| `stack` | string | no | Stack trace (solo en errors) |
| `meta` | object | no | Metadata adicional (cualquier campo extra) |

---

### 7.2 Trazas — `POST /ingest/traces`

Formato estándar OTLP/HTTP JSON. Compatible con cualquier SDK de OpenTelemetry.

```bash
curl -X POST http://localhost:3099/ingest/traces \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [
      {
        "resource": {
          "attributes": [
            { "key": "service.name", "value": { "stringValue": "api-gateway" } }
          ]
        },
        "scopeSpans": [
          {
            "spans": [
              {
                "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
                "spanId": "00f067aa0ba902b7",
                "parentSpanId": null,
                "name": "POST /outbound/servicenow/incidents",
                "kind": 2,
                "startTimeUnixNano": "1712390400000000000",
                "endTimeUnixNano": "1712390400250000000",
                "status": { "code": 1 },
                "attributes": [
                  { "key": "correlation.id", "value": { "stringValue": "a1b2c3d4-e5f6-..." } },
                  { "key": "http.status_code", "value": { "intValue": 201 } }
                ]
              }
            ]
          }
        ]
      }
    ]
  }'
```

Respuesta: `202 Accepted` — `{ "saved": 1 }`

> El servicio extrae automáticamente `correlation.id` (o `correlationId`) del span attributes
> para indexarlo como `correlationId` en la tabla, permitiendo búsquedas cross-signal.

---

### 7.3 Métricas — `POST /ingest/metrics`

```bash
curl -X POST http://localhost:3099/ingest/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": [
      {
        "name": "http_requests_total",
        "service": "api-gateway",
        "value": 1,
        "type": "counter",
        "unit": "requests",
        "labels": { "method": "POST", "route": "/outbound/servicenow/incidents", "status": "201" },
        "correlationId": "a1b2c3d4-e5f6-...",
        "timestamp": "2026-04-06T10:00:00.000Z"
      },
      {
        "name": "snow_ticket_creation_duration_ms",
        "service": "api-snowq-service",
        "value": 248,
        "type": "histogram",
        "unit": "ms",
        "labels": { "result": "success" },
        "timestamp": "2026-04-06T10:00:00.000Z"
      }
    ]
  }'
```

Respuesta: `202 Accepted` — `{ "saved": 2 }`

---

## 8. API de consulta

Todos los endpoints de consulta **requieren** un token M2M Ed25519:

```
Authorization: Bearer <M2M_JWT>
```

Obtener el token desde el ecosistema ABAC:

```bash
curl -X POST http://localhost:3005/auth/m2m-token \
  -H "Content-Type: application/json" \
  -d '{ "apiKey": "<ABAC_API_KEY>", "apiSecret": "<ABAC_API_SECRET>" }'
```

---

### 8.1 Consultar logs — `GET /query/logs`

```bash
curl "http://localhost:3099/query/logs?correlationId=a1b2c3d4-e5f6-...&limit=50" \
  -H "Authorization: Bearer <token>"
```

**Query params disponibles:**

| Param | Tipo | Descripción |
|---|---|---|
| `service` | string | Filtrar por servicio (ej. `monolith`) |
| `level` | string | `error\|warn\|info\|http\|debug\|verbose` |
| `correlationId` | UUID | Buscar todos los logs de una request específica |
| `traceId` | string | Buscar por trace ID |
| `from` | ISO 8601 | Timestamp mínimo |
| `to` | ISO 8601 | Timestamp máximo |
| `search` | string | Búsqueda en el campo `message` (LIKE) |
| `limit` | number (1-500) | Máximo registros a devolver (default: 100) |
| `offset` | number | Paginación (default: 0) |

**Respuesta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "level": "info",
      "message": "Incident created successfully",
      "correlationId": "a1b2c3d4-...",
      "traceId": "4bf92f35...",
      "spanId": "00f067aa...",
      "context": "IncidentService",
      "service": "monolith",
      "stack": null,
      "meta": null,
      "timestamp": "2026-04-06T10:00:00.000Z",
      "receivedAt": "2026-04-06T10:00:00.120Z"
    }
  ],
  "total": 1
}
```

---

### 8.2 Consultar trazas — `GET /query/traces`

```bash
# Buscar todos los spans de una correlación
curl "http://localhost:3099/query/traces?correlationId=a1b2c3d4-e5f6-..." \
  -H "Authorization: Bearer <token>"

# Obtener todos los spans de un trace completo
curl "http://localhost:3099/query/traces/4bf92f3577b34da6a3ce929d0e0e4736" \
  -H "Authorization: Bearer <token>"
```

**Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `traceId` | string | Filtrar por trace ID exacto |
| `correlationId` | UUID | Spans que contienen este correlationId |
| `serviceName` | string | Filtrar por servicio |
| `name` | string | Nombre del span (LIKE) |
| `from` / `to` | ISO 8601 | Rango por `receivedAt` |
| `limit` / `offset` | number | Paginación |

---

### 8.3 Consultar métricas — `GET /query/metrics`

```bash
# Métricas de error del monolith en la última hora
curl "http://localhost:3099/query/metrics?service=monolith&name=error&from=2026-04-06T09:00:00Z" \
  -H "Authorization: Bearer <token>"
```

**Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `name` | string | Nombre de la métrica (LIKE) |
| `service` | string | Filtrar por servicio |
| `correlationId` | UUID | Métricas de una request específica |
| `from` / `to` | ISO 8601 | Rango temporal |
| `limit` / `offset` | number | Paginación |

---

### 8.4 Health check — `GET /health`

```bash
curl http://localhost:3099/health
# {"status":"ok","db":"ok","uptime":342.17}
```

No requiere autenticación.

---

## 9. Retención automática de datos

Un job programado se ejecuta **diariamente a las 02:00** y elimina registros anteriores al umbral configurado.

| Variable | Default | Tabla afectada |
|---|---|---|
| `LOG_RETENTION_DAYS` | 30 días | `obs_log_entries` (campo `timestamp`) |
| `TRACE_RETENTION_DAYS` | 7 días | `obs_trace_spans` (campo `receivedAt`) |
| `METRIC_RETENTION_DAYS` | 14 días | `obs_metric_points` (campo `timestamp`) |

El log de cada ejecución indica cuántos registros fueron eliminados:

```
[RetentionService] Retention pruning complete — logs: 1240, spans: 380, metrics: 95
```

---

## 10. Modo híbrido (Jaeger / Prometheus)

Por defecto las variables están vacías y el reenvío está desactivado. No hay cambios de código necesarios.

### Activar reenvío a Jaeger

```dotenv
# .env.staging
JAEGER_OTLP_URL=http://jaeger:4318
```

Al reiniciar, cada traza ingestada se reenvía también a Jaeger en formato OTLP/HTTP.
Los logs y métricas llegan solo a MySQL (Jaeger no los acepta).

### Activar reenvío a Prometheus Pushgateway

```dotenv
# .env.staging
PROMETHEUS_PUSHGATEWAY_URL=http://prometheus-pushgateway:9091
```

Cada batch de métricas se convierte a formato Prometheus text y se envía al Pushgateway.

### Comportamiento ante fallos del backend externo

El reenvío es **fire-and-forget**: si Jaeger o Prometheus no están disponibles,
el error se descarta silenciosamente. La ingesta en MySQL y la respuesta `202` al servicio
origen no se ven afectadas.

---

## 11. Esquema de tablas

### `obs_log_entries`

```sql
CREATE TABLE obs_log_entries (
    id            VARCHAR(36)  PRIMARY KEY,
    level         VARCHAR(10)  NOT NULL,
    message       TEXT         NOT NULL,
    correlationId VARCHAR(36),
    traceId       VARCHAR(64),
    spanId        VARCHAR(64),
    context       VARCHAR(100),
    service       VARCHAR(100) NOT NULL,
    stack         TEXT,
    meta          JSON,
    timestamp     DATETIME(3)  NOT NULL,
    receivedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_log_correlation (correlationId),
    INDEX idx_log_service_level (service, level),
    INDEX idx_log_timestamp (timestamp),
    INDEX idx_log_trace (traceId)
);
```

### `obs_trace_spans`

```sql
CREATE TABLE obs_trace_spans (
    id           VARCHAR(36)  PRIMARY KEY,
    traceId      VARCHAR(32)  NOT NULL,
    spanId       VARCHAR(16)  NOT NULL,
    parentSpanId VARCHAR(16),
    name         VARCHAR(255) NOT NULL,
    serviceName  VARCHAR(100) NOT NULL,
    correlationId VARCHAR(36),
    kind         VARCHAR(20),
    statusCode   VARCHAR(20),
    startTime    BIGINT       NOT NULL,  -- nanoseconds Unix epoch (string stored as bigint)
    endTime      BIGINT       NOT NULL,
    durationMs   INT,
    attributes   JSON,
    events       JSON,
    receivedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_span_trace (traceId),
    INDEX idx_span_correlation (correlationId),
    INDEX idx_span_service (serviceName),
    INDEX idx_span_start (startTime)
);
```

### `obs_metric_points`

```sql
CREATE TABLE obs_metric_points (
    id           VARCHAR(36)  PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    service      VARCHAR(100) NOT NULL,
    value        DOUBLE       NOT NULL,
    unit         VARCHAR(30),
    type         VARCHAR(30)  NOT NULL,  -- counter | gauge | histogram
    labels       JSON,
    correlationId VARCHAR(36),
    timestamp    DATETIME(3)  NOT NULL,
    receivedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metric_name_service (name, service),
    INDEX idx_metric_timestamp (timestamp),
    INDEX idx_metric_correlation (correlationId)
);
```

---

## 12. Flujo completo de un correlationId

Cuando ocurre un incidente en el sistema, el `correlationId` se propaga por todos los servicios
y se puede usar para reconstruir la historia completa:

```
1. Cliente HTTP  →  api-gateway
   CorrelationMiddleware asigna correlationId = UUID (o hereda x-correlation-id del header)

2. api-gateway  →  monolith
   Header: x-correlation-id: <cid>

3. monolith  →  OutboxWorkerService
   correlation.run(fn, { correlationId: domainEvent.correlationId })

4. monolith  →  api-gateway  →  api-snowq-service
   Header: x-correlation-id: <cid>
   SnowqAdapter registra: requestCorrelationId → snowqCorrelationId

5. ReconcilerJob (monolith)
   correlation.run(fn, { correlationId: snowqCorrelationId })
```

**Auditoría completa de un incidente:**

```bash
CID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
TOKEN="Bearer eyJ..."

# 1. Todos los logs de esta request en orden cronológico
curl "http://localhost:3099/query/logs?correlationId=$CID&limit=200" \
  -H "Authorization: $TOKEN" | jq '.data[] | {timestamp, service, level, message}'

# 2. Todos los spans (tiempo de ejecución por servicio)
curl "http://localhost:3099/query/traces?correlationId=$CID" \
  -H "Authorization: $TOKEN" | jq '.data[] | {serviceName, name, durationMs, statusCode}'

# 3. Métricas generadas durante esta request
curl "http://localhost:3099/query/metrics?correlationId=$CID" \
  -H "Authorization: $TOKEN" | jq '.data[] | {name, value, service}'
```

---

## 13. Troubleshooting

### El servicio arranca pero no guarda logs de otros servicios

1. Verificar que `LOG_TRANSPORT_URL` está configurado en el `.env.*` del servicio origen.
2. Verificar que el servicio origen fue **reiniciado** tras añadir la variable.
3. Revisar que el endpoint responde: `curl -I http://localhost:3099/ingest/logs`
4. Buscar en los logs del servicio origen líneas de `WinstonHttpTransport` con errores.

### Error 401 en endpoints de consulta

El token M2M debe cumplir:
- Algoritmo: `EdDSA`
- Claim `type: "service"`
- `iss` igual a `JWT_ISSUER` (default: `abac-service`)
- No expirado

Verificar obteniéndolo del endpoint ABAC y decodificando el payload (base64 del segmento central).

### Error de conexión a MySQL al arrancar

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

Verificar que la base de datos `observability_db` existe:

```sql
SHOW DATABASES LIKE 'observability_db';
```

Si no existe, ejecutar el comando de [sección 3](#3-configuración-de-la-base-de-datos).

### Las trazas llegan pero `correlationId` es null

El span debe incluir un atributo con clave `correlation.id` o `correlationId`:

```json
{ "key": "correlation.id", "value": { "stringValue": "<uuid>" } }
```

Verificar que el `CorrelationIdService` del servicio origen está configurando el atributo
en el span activo de OpenTelemetry.

### Retención no elimina datos

El job corre a las 02:00. Para ejecutarlo manualmente durante desarrollo,
llamar directamente al método desde un script o reiniciar el servicio con
`RETENTION_RUN_ON_STARTUP=true` (no implementado — usar la consola MySQL directamente):

```sql
-- Limpiar logs de más de 30 días manualmente
DELETE FROM obs_log_entries WHERE timestamp < DATE_SUB(NOW(), INTERVAL 30 DAY);
```
