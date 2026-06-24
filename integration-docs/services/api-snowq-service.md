# api-snowq-service

**Puerto:** 3090
**Path:** `workspace-santander/api-snowq-service`
**Base de datos:** MySQL (`incidences_dbase`)

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
| Concurrency (PQueue) | 5 simultáneos hacia SN |
| Retry | Max 3 intentos, backoff exponencial |
| Circuit breaker | opossum, 50% error threshold, reset 30s |
| Bulkhead | Protege contra storms de peticiones inbound |
| Deduplicación | SHA-256 fingerprint por payload |
| DLQ | Estado FAILED → endpoints /failed/* |
| TTL | Expiración configurable por request |

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

- **Auth:** OAuth2 Client Credentials (token propio, renovación automática via interceptor axios)
- **URL base:** `BASE_URL_SERVICENOW` (env var)
- **Timeout:** 10 segundos por request
- El token OAuth2 se obtiene en `ServiceNowTokenService` y se inyecta en cada request via interceptor

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
SN_AUTH=base64(user:password)
HOST_DATABASE=localhost
PORT_DATABASE=3306
USERNAME_DATABASE=root
PASSWORD_DATABASE=root
DATABASE_DATABASE=incidences_dbase
```
