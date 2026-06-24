# Event Corner API — Guía de Uso con cURL

Base URL gateway: `http://localhost:3000`
Base URL ABAC:    `http://localhost:3005`

---

## Tabla de Contenidos

0. [Autenticación](#0-autenticación)
1. [Corners](#1-corners)
2. [Franjas Horarias y Técnicos](#2-franjas-horarias-y-técnicos)
3. [Disponibilidad](#3-disponibilidad)
4. [Incidencias](#4-incidencias)
5. [Solicitudes (Requests)](#5-solicitudes-requests)
6. [Tipos de Incidencia (Admin)](#6-tipos-de-incidencia-admin)
7. [Flujos Completos](#7-flujos-completos)

---

## 0. Autenticación

El sistema soporta los siguientes modos de autenticación:

| Quién | Modo | Endpoint de obtención |
|---|---|---|
| Usuarios corporativos | **Entra ID / Azure AD** | Token obtenido de Microsoft (MSAL, etc.) |
| Servicios internos | **M2M Token** | `POST /auth/m2m-token` (ABAC) |
| Apps externas | **OAuth 2.0 Client Credentials** | `POST /auth/oauth/token` (ABAC) |

> **Requerimiento del cliente:** los usuarios finales deben autenticarse exclusivamente con Entra ID (Azure AD/Microsoft SSO). No hay login por email/contraseña para usuarios.

---

### 0.1 M2M Token (servicios internos)

Para servicios del ecosistema (monolith, api-snowq, integration-service).
Credentials en la salida de `npm run abac:seed:m2m`.

```bash
curl -s -X POST http://localhost:3005/auth/m2m-token \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "ak_<hex>",
    "apiSecret": "sec_<hex>"
  }' | jq '{accessToken, expiresIn, permissions}'
```

**Respuesta:**
```json
{
  "accessToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "applicationId": "uuid",
  "applicationName": "api-gateway",
  "permissions": ["incidents:read", "incidents:write", "..."]
}
```

> El `accessToken` resultante se guarda en `ABAC_M2M_TOKEN` del servicio. Se rota cada ~180 días (configurable por servicio).

---

### 0.2 OAuth 2.0 Client Credentials (apps externas — RFC 6749)

Para aplicaciones externas que necesitan acceso limitado a la API.

**Paso 1: Registrar el cliente OAuth** (admin, una sola vez):
```bash
ADMIN_TOKEN="eyJ..."

curl -s -X POST http://localhost:3005/applications/oauth \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-reportes-bi",
    "description": "App BI del equipo de datos",
    "ownerId": "<uuid-service-account>",
    "scopes": ["incidents:read", "requests:read"]
  }' | jq '{client_id, client_secret, scopes}'
# ⚠️  Guardar client_secret — no se puede recuperar después
```

**Paso 2: Obtener access token** (app externa, cada ~1h):
```bash
curl -s -X POST http://localhost:3005/auth/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "ak_xxx",
    "client_secret": "sec_yyy",
    "scope": "incidents:read"
  }' | jq '{access_token, token_type, expires_in, scope}'
```

**Respuesta RFC 6749:**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "incidents:read"
}
```

**Paso 3: Usar el token en el gateway:**
```bash
ACCESS_TOKEN="eyJ..."

curl http://localhost:3000/api/incidents \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Rotar client_secret:**
```bash
curl -s -X POST http://localhost:3005/applications/<app-id>/rotate-secret \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "updatedBy": "<admin-user-id>" }' \
  | jq '{client_id, client_secret}'
# ⚠️  Guardar nuevo client_secret — no se puede recuperar después
```

**Errores OAuth estándar:**
```json
// grant_type incorrecto
{ "error": "unsupported_grant_type", "error_description": "..." }

// credenciales incorrectas o tipo != 'oauth_client'
{ "error": "invalid_client", "error_description": "..." }

// scope solicitado no está en application.scopes
{ "error": "invalid_scope", "error_description": "..." }
```

---

### 0.3 Entra ID / Azure AD (usuarios corporativos — único modo para usuarios)

Para usuarios que se autentican con su cuenta Microsoft corporativa.
La validación JWKS está centralizada en ABAC — el gateway delega automáticamente.

```bash
# El usuario obtiene el token de Azure por su cuenta (MSAL, etc.)
AZURE_TOKEN="eyJ..."   # token con iss: login.microsoftonline.com

# Usarlo directamente en el gateway — el gateway detecta y delega a ABAC
curl http://localhost:3000/api/incidents \
  -H "Authorization: Bearer $AZURE_TOKEN"
```

El gateway detecta el token Entra ID por el `iss` claim (decode local) y llama:
```
POST /auth/validate-entra  →  abac-microservice
  1. JWKS validate (firma Azure)
  2. syncEntraUser (find/create usuario por oid)
  3. Return { userId, permissions }
```

**Requisito:** `AZURE_TENANT_ID` y `AZURE_CLIENT_ID` deben estar configurados en `apps/abac-microservice/.env.*`. Si Entra ID no está disponible, el acceso se deniega (fail-closed).

**Primer login:** el usuario se crea automáticamente en ABAC sin roles (lazy sync).
Un admin debe asignarle un rol antes de que tenga acceso a recursos:
```bash
curl -X POST http://localhost:3005/user-roles \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<uuid-creado-por-sync>",
    "roleId": "<uuid-del-rol>",
    "applicationId": "<ABAC_APP_ID>"
  }'
```

**Variables de entorno requeridas** (en `apps/abac-microservice/.env.*`):
```env
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

### 0.4 Resumen de modos

| Modo | Obtención del token | Quién lo usa | Endpoints accesibles |
|---|---|---|---|
| **Entra ID** ⭐ | Token Azure (MSAL, OAuth corporativo) | Todos los usuarios finales | Todos los endpoints del gateway |
| **M2M interno** | `POST /auth/m2m-token` (ABAC) | Servicios internos del ecosistema | Rutas `@IsInternal()` del gateway |
| **OAuth client_credentials** | `POST /auth/oauth/token` (ABAC) | Apps externas con client_id/secret | Endpoints públicos del gateway (scopes) |

> ⭐ Entra ID es el único modo soportado para usuarios. No hay login por email/contraseña en esta versión.

---

## 1. Corners

### Listar todos los corners activos
```bash
curl -X GET http://localhost:3000/api/corners \
  -H "Accept: application/json"
```

**Respuesta esperada:**
```json
[
  {
    "id": "corner-uuid-1",
    "name": "Torre Central - Piso 3",
    "slotDurationMinutes": 15,
    "onlyTechnicians": false,
    "servicenowLocation": "MAD-TC-03",
    "isActive": true
  }
]
```

---

### Obtener un corner por ID
```bash
curl -X GET http://localhost:3000/api/corners/corner-uuid-1 \
  -H "Accept: application/json"
```

---

### Crear un corner
```bash
curl -X POST http://localhost:3000/api/corners \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Torre Central - Piso 3",
    "slotDurationMinutes": 15,
    "onlyTechnicians": false,
    "servicenowLocation": "MAD-TC-03",
    "clientName": "Banco Santander",
    "description": "Soporte hardware planta 3"
  }'
```

**Respuesta esperada (201):**
```json
{
  "id": "corner-uuid-1",
  "name": "Torre Central - Piso 3",
  "slotDurationMinutes": 15,
  "isActive": true
}
```

---

### Actualizar un corner
```bash
curl -X PUT http://localhost:3000/api/corners/corner-uuid-1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Torre Central - Piso 4",
    "servicenowLocation": "MAD-TC-04"
  }'
```

---

### Desactivar un corner
```bash
curl -X DELETE http://localhost:3000/api/corners/corner-uuid-1
```

---

## 2. Franjas Horarias y Técnicos

### Añadir franja horaria a un corner
```bash
curl -X POST http://localhost:3000/api/corners/corner-uuid-1/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mañana Lunes",
    "dayOfWeek": "MON",
    "startTime": "09:00",
    "endTime": "14:00",
    "validFrom": "2026-03-01",
    "validUntil": "2026-03-31"
  }'
```

**Días de semana válidos:** `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`

**Respuesta esperada (201):**
```json
{
  "id": "schedule-uuid-1",
  "cornerId": "corner-uuid-1",
  "dayOfWeek": "MON",
  "startTime": "09:00",
  "endTime": "14:00",
  "validFrom": "2026-03-01T00:00:00.000Z",
  "validUntil": "2026-03-31T00:00:00.000Z"
}
```

---

### Listar franjas horarias de un corner
```bash
curl -X GET http://localhost:3000/api/corners/corner-uuid-1/schedules \
  -H "Accept: application/json"
```

---

### Asignar técnicos a una franja horaria
```bash
curl -X POST http://localhost:3000/api/corners/corner-uuid-1/schedules/schedule-uuid-1/technicians \
  -H "Content-Type: application/json" \
  -d '{
    "technicianIds": [
      "tech-uuid-1",
      "tech-uuid-2",
      "tech-uuid-3"
    ]
  }'
```

**Respuesta esperada (200):**
```json
{
  "message": "Technicians assigned successfully"
}
```

---

## 3. Disponibilidad

### Consultar disponibilidad de slots (duración en minutos)
```bash
curl -X GET "http://localhost:3000/api/availability/corner-uuid-1?date=2026-03-09&duration=30" \
  -H "Accept: application/json"
```

**Parámetros:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `date` | string (YYYY-MM-DD) | Día a consultar |
| `duration` | number | Minutos necesarios para la cita |

**Respuesta esperada:**
```json
[
  {
    "startTime": "2026-03-09T09:00:00.000Z",
    "endTime": "2026-03-09T09:30:00.000Z",
    "available": false,
    "technicians": {
      "total": 3,
      "available": 0,
      "availableNames": [],
      "occupied": [
        { "id": "tech-uuid-1", "name": "Juan Pérez", "occupiedUntil": "2026-03-09T09:30:00.000Z" },
        { "id": "tech-uuid-2", "name": "Ana García", "occupiedUntil": "2026-03-09T09:15:00.000Z" },
        { "id": "tech-uuid-3", "name": "Pedro Ruiz", "occupiedUntil": "2026-03-09T09:45:00.000Z" }
      ]
    },
    "occupiedSlots": ["slot-uuid-1", "slot-uuid-2"]
  },
  {
    "startTime": "2026-03-09T09:30:00.000Z",
    "endTime": "2026-03-09T10:00:00.000Z",
    "available": true,
    "technicians": {
      "total": 3,
      "available": 2,
      "availableNames": ["Ana García", "Pedro Ruiz"],
      "occupied": [
        { "id": "tech-uuid-1", "name": "Juan Pérez", "occupiedUntil": "2026-03-09T09:45:00.000Z" }
      ]
    },
    "occupiedSlots": []
  }
]
```

---

### Consultar disponibilidad de técnicos en un día
```bash
curl -X GET "http://localhost:3000/api/availability/corner-uuid-1/technicians?date=2026-03-09" \
  -H "Accept: application/json"
```

**Respuesta esperada:**
```json
[
  {
    "technicianId": "tech-uuid-1",
    "name": "Juan Pérez",
    "available": false,
    "occupiedUntil": "2026-03-09T09:45:00.000Z",
    "currentIncidentId": "incident-uuid-1"
  },
  {
    "technicianId": "tech-uuid-2",
    "name": "Ana García",
    "available": true
  }
]
```

---

## 4. Incidencias

### Crear una incidencia (usuario reserva cita)
```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "issueTypeId": "issue-type-uuid-1",
    "customerId": "user-uuid-1",
    "cornerId": "corner-uuid-1",
    "slotIds": ["slot-uuid-3", "slot-uuid-4"],
    "startTime": "2026-03-09T09:30:00.000Z",
    "endTime": "2026-03-09T10:00:00.000Z",
    "origin": "CUSTOMER_APP",
    "device": {
      "serialNumber": "SN-ABC123XYZ",
      "model": "ThinkPad T14",
      "deviceType": "Portátil"
    }
  }'
```

**Respuesta esperada (201):**
```json
{
  "id": "incident-uuid-1",
  "status": "CREATED",
  "customerId": "user-uuid-1",
  "cornerId": "corner-uuid-1",
  "scheduledRange": {
    "start": "2026-03-09T09:30:00.000Z",
    "end": "2026-03-09T10:00:00.000Z"
  }
}
```

---

### Ver incidencias del pool (técnico)

El pool contiene **todas las incidencias no terminales** del corner, sin importar estado ni técnico asignado. Cualquier técnico puede tomar cualquiera de ellas.

Estados visibles en el pool: `CREATED`, `REOPENED`, `IN_PROGRESS`, `PAUSED`, `WAITING_FOR_RESPONSE`, `CLOSED`.
**No aparecen:** `VALIDATED`, `CANCELED`.

```bash
curl -X GET "http://localhost:3000/api/incidents/available?cornerId=corner-uuid-1" \
  -H "Accept: application/json"
```

**Respuesta esperada:**
```json
[
  {
    "id": "incident-uuid-1",
    "status": "CREATED",
    "currentTechnicianId": null,
    "scheduledRange": { "start": "2026-03-09T09:30:00.000Z", "end": "2026-03-09T10:00:00.000Z" }
  },
  {
    "id": "incident-uuid-2",
    "status": "IN_PROGRESS",
    "currentTechnicianId": "tech-uuid-1",
    "scheduledRange": { "start": "2026-03-09T10:00:00.000Z", "end": "2026-03-09T10:30:00.000Z" }
  },
  {
    "id": "incident-uuid-3",
    "status": "PAUSED",
    "currentTechnicianId": "tech-uuid-2",
    "scheduledRange": { "start": "2026-03-09T10:30:00.000Z", "end": "2026-03-09T11:00:00.000Z" }
  }
]
```

---

### Ver incidencias de un técnico
```bash
curl -X GET http://localhost:3000/api/incidents/technician/tech-uuid-1 \
  -H "Accept: application/json"
```

---

### Obtener detalle de una incidencia
```bash
curl -X GET http://localhost:3000/api/incidents/incident-uuid-1 \
  -H "Accept: application/json"
```

---

### Tomar una incidencia (técnico se convierte en el asignado)

Cualquier técnico puede tomar cualquier incidencia no terminal, sin importar el estado actual ni quién la tenga asignada. **El estado NO cambia**, solo cambia el técnico asignado.

```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/take \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1"
  }'
```

**Respuesta esperada:**
```json
{
  "id": "incident-uuid-1",
  "status": "IN_PROGRESS",
  "currentTechnicianId": "tech-uuid-1"
}
```

> **Nota:** Si la incidencia ya tenía un técnico asignado (`tech-uuid-2`), ese técnico la pierde automáticamente. El estado se mantiene tal como estaba (`IN_PROGRESS`, `PAUSED`, etc.).

---

### Liberar una incidencia (técnico la devuelve al pool)
```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/release \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "reason": "Cambio de turno"
  }'
```

---

### Cambiar estado de una incidencia (técnico)

**Regla:** Cualquier técnico puede cambiar el estado de cualquier incidencia, sin importar quién la tenga asignada.

| Desde                       | Hacia                  | Actor              | Endpoint         |
|-----------------------------|------------------------|--------------------|------------------|
| `CREATED` / `REOPENED`      | `IN_PROGRESS`          | Cualquier técnico  | `PATCH /status`  |
| `CREATED` / `REOPENED`      | `CANCELED`             | Cualquier técnico  | `PATCH /status`  |
| `IN_PROGRESS`               | `PAUSED`               | Cualquier técnico  | `PATCH /status`  |
| `IN_PROGRESS`               | `WAITING_FOR_RESPONSE` | Cualquier técnico  | `PATCH /status`  |
| `IN_PROGRESS`               | `CLOSED`               | Cualquier técnico  | `PATCH /status`  |
| `PAUSED`                    | `IN_PROGRESS`          | Cualquier técnico  | `PATCH /status`  |
| `PAUSED`                    | `WAITING_FOR_RESPONSE` | Cualquier técnico  | `PATCH /status`  |
| `WAITING_FOR_RESPONSE`      | `IN_PROGRESS`          | Cualquier técnico  | `PATCH /status`  |
| `WAITING_FOR_RESPONSE`      | `CLOSED`               | Cualquier técnico  | `PATCH /status`  |
| `CLOSED`                    | `VALIDATED` ✅          | **Usuario**        | `PATCH /validate`|
| `CLOSED`                    | `REOPENED` 🔄           | **Usuario**        | `PATCH /reopen`  |

#### Pausar (esperando repuesto)
```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "PAUSED",
    "comment": "Pendiente de batería de reemplazo"
  }'
```

#### Reanudar tras pausa
```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "IN_PROGRESS",
    "comment": "Llegó el repuesto, continúo la reparación"
  }'
```

#### Esperando respuesta del usuario
```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "WAITING_FOR_RESPONSE",
    "comment": "Se solicita confirmación de datos al usuario"
  }'
```

#### Cerrar incidencia (técnico da por solucionado)
```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "CLOSED",
    "comment": "Portátil reparado y entregado al usuario"
  }'
```

#### Cancelar incidencia
```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "CANCELED",
    "comment": "El usuario no acudió a la cita"
  }'
```

---

### Validar solución (usuario acepta — VALIDATED)

El usuario confirma que el problema está resuelto. Estado terminal.

```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/validate \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "user-uuid-1"
  }'
```

**Respuesta esperada:**
```json
{
  "id": "incident-uuid-1",
  "status": "VALIDATED"
}
```

---

### Reabrir incidencia (usuario rechaza — REOPENED)

El usuario no acepta la solución. La incidencia vuelve al pool disponible para cualquier técnico.

```bash
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/reopen \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "user-uuid-1",
    "reason": "El equipo sigue sin encender correctamente"
  }'
```

**Respuesta esperada:**
```json
{
  "id": "incident-uuid-1",
  "status": "REOPENED",
  "currentTechnicianId": null
}
```

---

## 5. Solicitudes (Requests)

Las solicitudes son tareas administrativas creadas por técnicos que van directamente a ServiceNow (onboarding, decomisión, entrega de equipo, etc.).

### Crear una solicitud
```bash
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "issueTypeId": "issue-type-decom-uuid",
    "technicianId": "tech-uuid-1",
    "customerId": "user-uuid-2",
    "cornerId": "corner-uuid-1",
    "companyId": "company-uuid-1",
    "scheduledAt": "2026-03-10T11:00:00.000Z",
    "notes": "Decomisión por baja voluntaria del empleado. Portátil modelo ThinkPad T14."
  }'
```

**Respuesta esperada (201):**
```json
{
  "id": "request-uuid-1",
  "status": "CREATED",
  "technicianId": "tech-uuid-1",
  "customerId": "user-uuid-2",
  "scheduledAt": "2026-03-10T11:00:00.000Z",
  "servicenowNumber": "REQ0001234"
}
```

---

### Listar solicitudes de un técnico
```bash
curl -X GET "http://localhost:3000/api/requests?technicianId=tech-uuid-1" \
  -H "Accept: application/json"
```

---

### Listar solicitudes de un usuario (cliente)
```bash
curl -X GET "http://localhost:3000/api/requests?customerId=user-uuid-2" \
  -H "Accept: application/json"
```

---

### Obtener detalle de una solicitud
```bash
curl -X GET http://localhost:3000/api/requests/request-uuid-1 \
  -H "Accept: application/json"
```

---

### Cambiar estado de una solicitud
```bash
curl -X PATCH http://localhost:3000/api/requests/request-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "COMPLETED",
    "comment": "Equipo recogido y procesado correctamente"
  }'
```

---

## 6. Tipos de Incidencia (Admin)

### Listar tipos de incidencia
```bash
# Todos
curl -X GET http://localhost:3000/api/admin/issue-types \
  -H "Accept: application/json"

# Solo hardware (ISSUE)
curl -X GET "http://localhost:3000/api/admin/issue-types?category=ISSUE" \
  -H "Accept: application/json"

# Solo visibles al usuario
curl -X GET "http://localhost:3000/api/admin/issue-types?visibleToUsers=true" \
  -H "Accept: application/json"

# Por tipo de dispositivo
curl -X GET "http://localhost:3000/api/admin/issue-types?deviceType=Portátil" \
  -H "Accept: application/json"
```

---

### Obtener un tipo por ID
```bash
curl -X GET http://localhost:3000/api/admin/issue-types/issue-type-uuid-1 \
  -H "Accept: application/json"
```

---

### Crear tipo de incidencia hardware (ISSUE)
```bash
curl -X POST http://localhost:3000/api/admin/issue-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Avería de portátil",
    "category": "ISSUE",
    "deviceType": "Portátil",
    "workMinutes": 30,
    "spareMinutes": 15,
    "closeMinutes": 5,
    "notUserVisible": false,
    "position": 1,
    "npsDisabled": false,
    "servicenowCategory": "hardware",
    "servicenowCloseCategory": "hardware_error"
  }'
```

**Categorías válidas:** `ISSUE`, `REQUEST`, `REQUEST-ONBOARDING`, `REQUEST-DECOMMISSION`, `REQUEST-DELIVERY`

---

### Crear tipo de solicitud administrativa (REQUEST)
```bash
curl -X POST http://localhost:3000/api/admin/issue-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Decomisión digital (portátil)",
    "category": "REQUEST-DECOMMISSION",
    "deviceType": "Portátil",
    "workMinutes": 20,
    "spareMinutes": 0,
    "closeMinutes": 0,
    "notUserVisible": true,
    "position": 2,
    "npsDisabled": false
  }'
```

---

### Actualizar tipo de incidencia
```bash
curl -X PUT http://localhost:3000/api/admin/issue-types/issue-type-uuid-1 \
  -H "Content-Type: application/json" \
  -d '{
    "workMinutes": 45,
    "spareMinutes": 10,
    "position": 3
  }'
```

---

### Eliminar (desactivar) tipo de incidencia
```bash
curl -X DELETE http://localhost:3000/api/admin/issue-types/issue-type-uuid-1
```

**Respuesta esperada:**
```json
{
  "message": "Issue type deleted successfully"
}
```

---

## 7. Flujos Completos

### Flujo 1: Configuración inicial de un corner

```bash
# Paso 1 — Crear el corner
CORNER_ID=$(curl -s -X POST http://localhost:3000/api/corners \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Torre Central - Piso 3",
    "slotDurationMinutes": 15,
    "servicenowLocation": "MAD-TC-03"
  }' | jq -r '.id')

echo "Corner creado: $CORNER_ID"

# Paso 2 — Añadir franja horaria de lunes a viernes mañana
SCHEDULE_ID=$(curl -s -X POST "http://localhost:3000/api/corners/$CORNER_ID/schedules" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mañanas L-V",
    "dayOfWeek": "MON",
    "startTime": "09:00",
    "endTime": "14:00",
    "validFrom": "2026-03-01",
    "validUntil": "2026-06-30"
  }' | jq -r '.id')

echo "Franja creada: $SCHEDULE_ID"

# Paso 3 — Asignar técnicos a la franja
curl -X POST "http://localhost:3000/api/corners/$CORNER_ID/schedules/$SCHEDULE_ID/technicians" \
  -H "Content-Type: application/json" \
  -d '{
    "technicianIds": ["tech-uuid-1", "tech-uuid-2"]
  }'
```

---

### Flujo 2a: Camino feliz — usuario valida la solución

```bash
# Paso 1 — Consultar disponibilidad
curl -s "http://localhost:3000/api/availability/corner-uuid-1?date=2026-03-09&duration=30" \
  | jq '[.[] | select(.available == true)] | .[0]'

# Paso 2 — Usuario reserva cita (estado: CREATED)
curl -X POST http://localhost:3000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "issueTypeId": "issue-type-uuid-1",
    "customerId": "user-uuid-1",
    "cornerId": "corner-uuid-1",
    "slotIds": ["slot-uuid-3", "slot-uuid-4"],
    "startTime": "2026-03-09T09:30:00.000Z",
    "endTime": "2026-03-09T10:00:00.000Z",
    "origin": "CUSTOMER_APP",
    "device": {
      "serialNumber": "SN-ABC123",
      "model": "ThinkPad T14",
      "deviceType": "Portátil"
    }
  }'

# Paso 3 — Técnico ve el pool (CREATED y REOPENED)
curl -s "http://localhost:3000/api/incidents/available?cornerId=corner-uuid-1"

# Paso 4 — Técnico toma la cita (estado: IN_PROGRESS)
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/take \
  -H "Content-Type: application/json" \
  -d '{ "technicianId": "tech-uuid-1" }'

# Paso 5 — Técnico cierra (estado: CLOSED)
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "CLOSED",
    "comment": "Equipo reparado y entregado"
  }'

# Paso 6 — Usuario valida la solución (estado: VALIDATED ✅ — terminal)
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/validate \
  -H "Content-Type: application/json" \
  -d '{ "customerId": "user-uuid-1" }'
```

---

### Flujo 2b: Usuario rechaza la solución — reapertura

```bash
# ... pasos 1-5 igual que Flujo 2a ...

# Paso 6 — Usuario rechaza (estado: REOPENED 🔄 — vuelve al pool)
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/reopen \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "user-uuid-1",
    "reason": "El equipo sigue sin encender correctamente"
  }'

# Paso 7 — Técnico 2 ve el pool (INC aparece como REOPENED)
curl -s "http://localhost:3000/api/incidents/available?cornerId=corner-uuid-1"

# Paso 8 — Técnico 2 toma la incidencia reabierta (estado: IN_PROGRESS)
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/take \
  -H "Content-Type: application/json" \
  -d '{ "technicianId": "tech-uuid-2" }'

# Paso 9 — Técnico 2 cierra definitivamente (estado: CLOSED)
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-2",
    "newStatus": "CLOSED",
    "comment": "Reemplazada placa base, equipo funcionando"
  }'

# Paso 10 — Usuario valida (estado: VALIDATED ✅)
curl -X PATCH http://localhost:3000/api/incidents/incident-uuid-1/validate \
  -H "Content-Type: application/json" \
  -d '{ "customerId": "user-uuid-1" }'
```

---

### Flujo 3: Técnico crea una decomisión (Request)

```bash
# Paso 1 — Crear la solicitud de decomisión
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "issueTypeId": "issue-type-decom-uuid",
    "technicianId": "tech-uuid-1",
    "customerId": "user-uuid-2",
    "cornerId": "corner-uuid-1",
    "companyId": "company-uuid-1",
    "scheduledAt": "2026-03-10T11:00:00.000Z",
    "notes": "Baja voluntaria. Recoger portátil ThinkPad T14 SN-XYZ789"
  }'
# → Se crea ticket automáticamente en ServiceNow vía Outbound Gateway
# → La respuesta incluye el número de ticket de ServiceNow (ej: REQ0001234)

# Paso 2 — Completar la solicitud una vez ejecutada
curl -X PATCH http://localhost:3000/api/requests/request-uuid-1/status \
  -H "Content-Type: application/json" \
  -d '{
    "technicianId": "tech-uuid-1",
    "newStatus": "COMPLETED",
    "comment": "Equipo recogido y procesado"
  }'
```

---

## Códigos de Error

| Código | Significado | Causa común |
|--------|-------------|-------------|
| `400` | Bad Request | Campos requeridos faltantes, formato inválido |
| `404` | Not Found | El recurso (corner, incidencia, etc.) no existe |
| `409` | Conflict | Transición de estado inválida, slot ya ocupado |
| `403` | Forbidden | El técnico no está autorizado para esta acción |
| `500` | Internal Server Error | Error inesperado del servidor |

**Formato de error:**
```json
{
  "statusCode": 409,
  "timestamp": "2026-03-09T10:15:30.000Z",
  "path": "/api/incidents/incident-uuid-1/take",
  "message": "Incident is not in CREATED state"
}
```
