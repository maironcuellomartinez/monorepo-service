# api-snowq-service

**Puerto:** 3090
**Path:** `workspace-santander/api-snowq-service`
**Base de datos:** MySQL (`incidences_dbase`)

> Resumen para el contexto de integración. Documentación completa (todos los endpoints, flujos,
> bulkhead/circuit breaker, backoff por prioridad, esquema de tablas):
> [`api-snowq-service/API_SNOWQ_SERVICE.md`](../../api-snowq-service/API_SNOWQ_SERVICE.md)

---

## Rol

Capa de transporte puro hacia ServiceNow.
**NO conoce** corners, issueTypes, usuarios ni dispositivos.
Recibe payloads ya resueltos y los entrega a ServiceNow de forma controlada.

También es el receptor de alertas de **Nagios/Thruk**.

---

## Endpoints

### Cola asíncrona (202 Accepted)
```
POST /snow-requests/incidents
POST /snow-requests/change-requests
POST /snow-requests/problems
POST /snow-requests/service-catalog
GET  /snow-requests/:correlationId         → estado de una request
GET  /snow-requests/failed                 → DLQ (requests fallidas)
POST /snow-requests/failed/retry-all
POST /snow-requests/failed/:correlationId/retry
```

### Inmediato/sincrónico (200 OK — usar para obtener sysId+number)
```
POST /snow-requests/immediate/incidents
POST /snow-requests/immediate/change-requests
POST /snow-requests/immediate/problems
...
```

### Monitoreo Nagios/Thruk
```
POST /monitoring/alerts                    → recibe notificaciones de Thruk
POST /monitoring/cancel/:fingerprint       → cancela por fingerprint
```

---

## Mecanismos de resiliencia

| Mecanismo | Configuración |
|-----------|--------------|
| Circuit breaker (`@backendkit-labs/circuit-breaker`) | 3 breakers nombrados — `sn:immediate` (50%, 3 llamadas mín., apertura 15s), `sn:monitoring` (60%, 5 llamadas mín., apertura 30s), `sn:queue` (50%, 5 llamadas mín., apertura 30s) |
| Bulkhead saliente hacia SN | 8 concurrentes / cola 40 / timeout 15s (`BulkheadRegistry.getForServiceNow()`) |
| Bulkhead inbound | Por ruta (middleware) + por cliente (interceptor) — ver doc completo |
| Retry (worker async) | Backoff exponencial + jitter por prioridad, máx. reintentos 5 (LOW) a 20 (CRITICAL) |
| Retry (modo inmediato) | Máx. 2 intentos, backoff fijo 500ms |
| Deduplicación | fingerprint explícito (Nagios: host+service) o hash de `incidentId`/`requestId`/`externalId` |
| DLQ | Estado FAILED → endpoints `/failed/*`, stats en `/dlq/stats` |
| TTL | Expiración configurable por request (`expiresAt`, chequeo cada ~30s) |

---

## Estados de una request

```
QUEUED → IN_PROGRESS → DELIVERED
                    ↘ FAILED (DLQ, max retries alcanzado)
         CANCELLED (si llega RECOVERY antes de enviarse)
         EXPIRED (TTL alcanzado)
         TOO_LATE (RECOVERY llegó cuando ya estaba IN_PROGRESS)
```

---

## Payload enviado a ServiceNow (Incident)

```json
{
  "short_description": "...",
  "description": "...",
  "caller_id": "UPN del usuario",
  "company": "sys_id de empresa en SN",
  "category": "categoría SN del issueType",
  "assignment_group": "grupo resolutor (de CornerIssueConfig o corner fallback)",
  "location": "servicenow_location del corner",
  "correlation_id": "serial number del dispositivo",
  "expected_start": "fecha de inicio del slot"
}
```

---

## Conexión a ServiceNow

- **URL base:** `BASE_URL_SERVICENOW` (env var)
- **Timeout:** 10 segundos por request
- **Auth saliente:** `SN_AUTH_MODE` decide el header `Authorization` en cada una de las 7 rutas
  salientes (`ServiceNowClientService.getAuthHeader()`):
  - `basic` (default, dev) → `Authorization: Basic ${SN_AUTH}` — legado
  - `oauth2` (staging/prod, en producción **desde 2026-07-17**) → `Authorization: Bearer <token>`,
    flujo **JWT Bearer grant** (RFC 7523, no Client Credentials): `ServiceNowTokenService` firma una
    assertion `RS256` con el certificado de `SN_OAUTH_CERT_PATH` y la intercambia por un access
    token contra `SN_OAUTH_URL`. El token se cachea en memoria (margen de 30s antes de expirar) y
    los refresh concurrentes comparten la misma promesa en vuelo — no hay interceptor de axios, el
    header se arma por request via `getAuthHeader()`.
  - Detalle completo: [`API_SNOWQ_SERVICE.md`](../../api-snowq-service/API_SNOWQ_SERVICE.md#5-autenticación)

---

## Procesamiento Nagios/Thruk

| Notificación | Acción |
|-------------|--------|
| `PROBLEM` (HARD) | Crea ticket (deduplica por fingerprint host+service) |
| `RECOVERY` | Cancela si QUEUED / cierra en SN si ya DELIVERED |
| `ACKNOWLEDGEMENT` | Ignora |
| `FLAPPINGSTART/STOP` | Ignora |
| `DOWNTIME*` | Ignora |
| `PROBLEM` (SOFT) | Ignora (servicio aún retrying) |

---

## Estados de cierre reconocidos

El reconciler (`MonitoringReconcilerService`) y el cliente (`ServiceNowClientService`) consideran
un ticket cerrado en ServiceNow cuando el campo `state` devuelto es uno de:

| Código | Significado | Aplica a |
|---|---|---|
| `6` | Resolved | incident |
| `7` | Closed | incident |
| `3` | Closed | change_request, sc_req_item, sc_task |
| `0` | Review / Resolved | change_request |
| `4` | Closed / Resolved | problem, sc_req_item, sc_task |
| `resolved` | Semántico | Todos (normalizado a lowercase) |
| `closed` | Semántico | Todos (normalizado a lowercase) |

El simulador `servicenow-clone-backend` retorna códigos numéricos (`'6'`, `'7'`, etc.)
y acepta strings semánticos en PATCH (`state: 'resolved'` → mapea al código correcto según tabla).

---

## Variables de entorno requeridas

```env
BASE_URL_SERVICENOW=http://servicenow-host
HOST_DATABASE=localhost
PORT_DATABASE=3306
USERNAME_DATABASE=root
PASSWORD_DATABASE=root
DATABASE_DATABASE=incidences_dbase
```

### Auth hacia ServiceNow — según `SN_AUTH_MODE`

```env
# basic (default) — legado
SN_AUTH_MODE=basic
SN_AUTH=base64(user:password)
```

```env
# oauth2 — JWT Bearer grant, obtención del token vía SN_OAUTH_URL
SN_AUTH_MODE=oauth2
SN_OAUTH_URL=https://<instancia-sn>/oauth_token.do      # endpoint token OAuth2 de ServiceNow
SN_OAUTH_UPN=svc-account@empresa.com                     # UPN de la cuenta de servicio en SN (claim sub)
SN_OAUTH_KID=<key-id-registrado-en-sn>                   # kid del certificado, header del JWT
SN_OAUTH_CLIENT_ID=<client-id-app-oauth2-en-sn>          # claims aud + client_id
SN_OAUTH_CLIENT_SECRET=<opcional-si-sn-lo-exige>
SN_OAUTH_ISS=<issuer-de-la-assertion>
SN_OAUTH_GRANT_TYPE=urn:ietf:params:oauth:grant-type:jwt-bearer   # default, no suele cambiar
SN_OAUTH_CERT_PATH=/ruta/al/certificado.pem              # clave privada, firma la assertion RS256
```

`main.ts` (`validateConfig()`) exige todo el bloque `SN_OAUTH_*` (menos `SECRET` y `GRANT_TYPE`,
opcionales) cuando `SN_AUTH_MODE=oauth2` en staging/producción — falla al arrancar si falta algo,
en vez de fallar recién en el primer ticket.
