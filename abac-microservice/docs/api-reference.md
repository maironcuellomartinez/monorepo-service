# API Reference — ABAC Microservice

**Base URL**: `http://localhost:3000`
**Swagger UI**: `http://localhost:3000/api-docs`

## Tabla de contenidos

- [Autenticación y sesiones (`/auth`)](#autenticación-y-sesiones)
- [Control de acceso ABAC (`/abac`)](#control-de-acceso-abac)
- [Aplicaciones (`/applications`)](#aplicaciones)
- [Permisos (`/permissions`)](#permisos)
- [Políticas (`/policies`)](#políticas)
- [Usuarios (`/users`)](#usuarios)
- [Asignación usuario-política (`/user-policies`)](#asignación-usuario-política)
- [Health check (`/health`)](#health-check)
- [Referencia de errores](#referencia-de-errores)

---

## Autenticación y sesiones

Los endpoints `/auth` son **públicos** (no requieren ningún token). El servidor extrae
`User-Agent` y `X-Forwarded-For` automáticamente de los headers para crear la sesión.

### POST /auth/login

Valida credenciales y abre una sesión. Devuelve un `accessToken` JWT de corta duración
y un `refreshToken` opaco de larga duración.

> Si el usuario ya tiene el número máximo de sesiones activas configurado para su
> aplicación o rol, el servidor responde **HTTP 409 Conflict** en lugar de crear una
> nueva sesión.

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Password123!"
  }'
```

**Cuerpo del request**

| Campo      | Tipo   | Requerido | Descripción          |
|------------|--------|-----------|----------------------|
| `email`    | string | Sí        | Email del usuario    |
| `password` | string | Sí        | Contraseña (min. 6c) |

**Respuesta 200**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a3f9c2d1e4b7...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "sessionId": "uuid-sesión",
  "user": {
    "id": "uuid-usuario",
    "email": "admin@example.com",
    "firstName": "Admin",
    "lastName": "User",
    "username": "admin"
  },
  "applications": [
    {
      "id": "uuid-app",
      "name": "Mi App",
      "membershipType": "member"
    }
  ]
}
```

**Respuesta 409** (máximo de sesiones concurrentes alcanzado)

```json
{
  "statusCode": 409,
  "message": "Ya tienes 1 sesión(es) activa(s). Cierra sesión antes de iniciar una nueva.",
  "error": "Conflict"
}
```

---

### POST /auth/logout

Revoca la sesión identificada por el `refreshToken`.

```bash
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "a3f9c2d1e4b7..."
  }'
```

**Cuerpo del request**

| Campo          | Tipo   | Requerido | Descripción     |
|----------------|--------|-----------|-----------------|
| `refreshToken` | string | Sí        | Token de refresco recibido en el login |

**Respuesta 200** — `{}`

---

### POST /auth/refresh

Rota el `refreshToken` generando un nuevo par de tokens. El token anterior queda
invalidado inmediatamente.

```bash
curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "a3f9c2d1e4b7..."
  }'
```

**Respuesta 200**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "b8e2d5f1a9c4...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "sessionId": "uuid-nueva-sesión"
}
```

---

### POST /auth/validate-token

Verifica la firma y expiración de un `accessToken` JWT. No consulta la base de datos
(validación stateless).

```bash
curl -s -X POST http://localhost:3000/auth/validate-token \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Respuesta 200**

```json
{
  "userId": "uuid-usuario",
  "email": "admin@example.com",
  "expiresAt": "2026-03-03T10:00:00.000Z"
}
```

**Respuesta 401** — Token inválido o expirado.

---

### POST /auth/validate-api-key

Verifica un par `apiKey` / `apiSecret` y crea una sesión para la aplicación propietaria.
Útil para autenticar backends de aplicaciones registradas.

```bash
curl -s -X POST http://localhost:3000/auth/validate-api-key \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "abcdef123456",
    "apiSecret": "secretHash..."
  }'
```

**Respuesta 200**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "uuid-owner",
  "email": "owner@example.com",
  "applicationId": "uuid-app",
  "applicationName": "Mi App",
  "expiresAt": "2026-03-10T00:00:00.000Z",
  "sessionDuration": 604800000
}
```

---

### POST /auth/m2m-token

Genera un token JWT de corta duración (1 hora) para autenticación **service-to-service (M2M)**. No crea sesión en Redis — es completamente stateless.

Usado por los servicios internos (api-gateway, monolith, integration-service, api-snowq) para autenticarse entre sí. Las credenciales se generan con `npm run abac:seed:m2m`.

```bash
curl -s -X POST http://localhost:3005/auth/m2m-token \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "ak_...",
    "apiSecret": "..."
  }'
```

**Cuerpo del request**

| Campo       | Tipo   | Requerido | Descripción                              |
|-------------|--------|-----------|------------------------------------------|
| `apiKey`    | string | Sí        | API Key de la Application del servicio   |
| `apiSecret` | string | Sí        | API Secret de la Application del servicio|

**Respuesta 200**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "applicationId": "uuid-application",
  "applicationName": "api-gateway",
  "permissions": ["incident:create", "minerva:read", "droppoint:create"]
}
```

**Claims del JWT**

| Claim             | Tipo     | Descripción                              |
|-------------------|----------|------------------------------------------|
| `sub`             | string   | UUID del service account (User owner)    |
| `type`            | string   | Siempre `"service"`                      |
| `applicationId`   | string   | UUID de la Application                   |
| `applicationName` | string   | Nombre legible del servicio              |
| `permissions`     | string[] | Array de `"resource:action"` permitidos  |
| `accountType`     | string   | Siempre `"service"`                      |

**Respuesta 401** — apiKey o apiSecret inválidos, Application inactiva o expirada.

> **Nota:** Para rotar credenciales, ejecutar `npm run abac:seed:m2m` desde la raíz del monorepo. El script es idempotente y muestra las nuevas credenciales por consola.

---

### POST /auth/entra-sync

Sincronización lazy de usuario Microsoft Entra ID (Azure AD) → ABAC. Llamado automáticamente por el `JwtGuard` del api-gateway cada vez que llega un token de Entra ID.

- Si el usuario **no existe** en ABAC → se crea con `accountType: 'user'`, sin password local.
- Si el usuario **existe** → actualiza `lastLoginAt` y email.
- Retorna el `userId` interno de ABAC y los permisos actuales del usuario.

Requiere header `x-api-key` con la API Key de la aplicación cliente (api-gateway).

```bash
curl -s -X POST http://localhost:3005/auth/entra-sync \
  -H "Content-Type: application/json" \
  -H "x-api-key: ec_f8ea8f1a33cf0ce19079e255ac25f19..." \
  -d '{
    "oid": "azure-object-id-del-usuario",
    "email": "usuario@santander.com",
    "displayName": "Juan Pérez",
    "applicationId": "uuid-application-opcional"
  }'
```

**Cuerpo del request**

| Campo           | Tipo   | Requerido | Descripción                              |
|-----------------|--------|-----------|------------------------------------------|
| `oid`           | string | Sí        | Azure AD object ID (claim `oid` del JWT) |
| `email`         | string | Sí        | Email del usuario (preferred_username)   |
| `displayName`   | string | No        | Nombre completo para crear el usuario    |
| `applicationId` | string | No        | UUID de la aplicación ABAC del caller    |

**Respuesta 200**

```json
{
  "userId": "uuid-usuario-interno-abac",
  "permissions": ["incident:create", "incident:read", "corner:read"]
}
```

**Respuesta 401** — `x-api-key` inválido o ausente.

---

## Control de acceso ABAC

Los endpoints `/abac` requieren el header **`X-API-KEY`** con la API Key de la
aplicación (el campo `apiKey` devuelto al crear la aplicación).

### POST /abac/can-access

Evalúa si un usuario tiene permiso para ejecutar una acción sobre un recurso,
considerando sus roles, permisos directos y políticas dinámicas con contexto.

```bash
curl -s -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: abcdef123456" \
  -d '{
    "userId": "uuid-usuario",
    "applicationId": "uuid-app",
    "resource": "reports",
    "action": "read",
    "context": {
      "ipAddress": "192.168.1.10",
      "location": "office",
      "hour": 14,
      "mfaVerified": true
    }
  }'
```

**Cuerpo del request**

| Campo           | Tipo   | Requerido | Descripción                                |
|-----------------|--------|-----------|--------------------------------------------|
| `userId`        | UUID   | Sí        | ID del usuario a evaluar                   |
| `applicationId` | UUID   | Sí        | ID de la aplicación                        |
| `resource`      | string | Sí        | Nombre del recurso (ej. `"reports"`)       |
| `action`        | string | Sí        | Acción sobre el recurso (ej. `"read"`)     |
| `context`       | object | No        | Atributos de contexto para reglas dinámicas|

**Respuesta 200**

```json
{ "granted": true }
```

---

### POST /abac/batch-evaluate

Evalúa múltiples combinaciones usuario/recurso/acción en una sola llamada. Ideal para
pre-cargar los permisos de una pantalla completa.

```bash
curl -s -X POST http://localhost:3000/abac/batch-evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: abcdef123456" \
  -d '{
    "requests": [
      {
        "userId": "uuid-usuario",
        "applicationId": "uuid-app",
        "resource": "dashboard",
        "action": "view",
        "context": {}
      },
      {
        "userId": "uuid-usuario",
        "applicationId": "uuid-app",
        "resource": "users",
        "action": "create",
        "context": { "department": "IT" }
      },
      {
        "userId": "uuid-usuario",
        "applicationId": "uuid-app",
        "resource": "reports",
        "action": "export",
        "context": {}
      }
    ]
  }'
```

**Respuesta 200**

```json
{
  "results": [
    { "userId": "uuid-usuario", "applicationId": "uuid-app", "resource": "dashboard", "action": "view",   "context": {}, "granted": true  },
    { "userId": "uuid-usuario", "applicationId": "uuid-app", "resource": "users",     "action": "create", "context": { "department": "IT" }, "granted": false },
    { "userId": "uuid-usuario", "applicationId": "uuid-app", "resource": "reports",   "action": "export", "context": {}, "granted": true  }
  ]
}
```

---

## Aplicaciones

Requieren **JWT Bearer Token** (`Authorization: Bearer <accessToken>`).
`GET /applications` además requiere rol `admin` y permiso `application:read`.

### POST /applications

Registra una nueva aplicación en el sistema. Al crearla se generan automáticamente
el `apiKey` y `apiSecret`.

```bash
curl -s -X POST http://localhost:3000/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "Portal RR.HH.",
    "description": "Sistema de gestión de recursos humanos",
    "environment": "production",
    "settings": {
      "maxConcurrentSessions": 1,
      "maxUsers": 500,
      "sessionTimeout": 1800,
      "requireMfa": false
    },
    "createdBy": "uuid-admin"
  }'
```

**Campos del request**

| Campo         | Tipo   | Requerido | Descripción                                    |
|---------------|--------|-----------|------------------------------------------------|
| `name`        | string | Sí        | Nombre único de la aplicación                  |
| `description` | string | No        | Descripción                                    |
| `environment` | string | No        | `"development"` \| `"staging"` \| `"production"` |
| `settings`    | object | No        | Configuración de sesión y límites              |
| `createdBy`   | string | Sí        | UUID del usuario que crea la app               |

**`settings` disponibles**

| Campo                    | Tipo    | Descripción                                         |
|--------------------------|---------|-----------------------------------------------------|
| `maxConcurrentSessions`  | number  | Sesiones activas simultáneas permitidas por usuario |
| `maxUsers`               | number  | Límite de usuarios registrados en la app            |
| `sessionTimeout`         | number  | Tiempo de inactividad en segundos (default 1800)    |
| `absoluteTimeout`        | number  | Duración máxima de sesión en segundos (default 28800)|
| `requireMfa`             | boolean | Exigir segundo factor                               |
| `allowedDomains`         | string[]| Dominios permitidos (CORS/login)                   |

**Respuesta 201**

```json
{
  "id": "uuid-app",
  "name": "Portal RR.HH.",
  "apiKey": "abcdef123456",
  "apiSecret": "$2b$10$...",
  "environment": "production",
  "isActive": true,
  "createdAt": "2026-03-02T10:00:00.000Z"
}
```

---

### GET /applications

Lista todas las aplicaciones con filtros opcionales.
Requiere rol `admin` y permiso `application:read`.

```bash
curl -s "http://localhost:3000/applications?isActive=true&environment=production&page=1&limit=10" \
  -H "Authorization: Bearer <accessToken>"
```

**Query params**

| Param         | Tipo    | Descripción                              |
|---------------|---------|------------------------------------------|
| `isActive`    | boolean | Filtrar por estado activo/inactivo       |
| `environment` | string  | Filtrar por entorno                      |
| `page`        | number  | Número de página (default 1)             |
| `limit`       | number  | Registros por página (default 10)        |

---

### POST /applications/:id/regenerate-api-key

Genera un nuevo `apiKey` y `apiSecret` para la aplicación. Los anteriores quedan
inválidos de inmediato.

```bash
curl -s -X POST http://localhost:3000/applications/uuid-app/regenerate-api-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{ "updatedBy": "uuid-admin" }'
```

---

### POST /applications/validate-api-key

Verifica la validez de un `apiKey` / `apiSecret` sin crear sesión.
Útil para comprobar credenciales sin autenticar.

```bash
curl -s -X POST http://localhost:3000/applications/validate-api-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "apiKey": "abcdef123456",
    "apiSecret": "el-secret-en-texto-plano"
  }'
```

---

## Permisos

Los endpoints `/permissions` son **públicos** (no requieren token).

### POST /permissions

Registra un permiso atómico en el catálogo.
Un permiso identifica una acción específica sobre un recurso: `resource:action`.

```bash
curl -s -X POST http://localhost:3000/permissions \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "reports",
    "action": "export",
    "description": "Permite exportar reportes a CSV/Excel",
    "category": "reporting",
    "weight": 10,
    "createdBy": "uuid-admin"
  }'
```

**Campos del request**

| Campo         | Tipo   | Requerido | Descripción                                       |
|---------------|--------|-----------|---------------------------------------------------|
| `resource`    | string | Sí        | Nombre del recurso (ej. `"users"`, `"reports"`)   |
| `action`      | string | Sí        | Acción (ej. `"read"`, `"create"`, `"export"`)     |
| `description` | string | No        | Descripción legible                               |
| `category`    | string | No        | Agrupación lógica                                 |
| `weight`      | number | No        | Peso/prioridad del permiso                        |
| `createdBy`   | string | No        | UUID del creador                                  |

**Respuesta 201**

```json
{
  "id": "uuid-permiso",
  "resource": "reports",
  "action": "export",
  "category": "reporting",
  "weight": 10,
  "isActive": true,
  "createdAt": "2026-03-02T10:00:00.000Z"
}
```

---

### GET /permissions

Devuelve todos los permisos registrados.

```bash
curl -s http://localhost:3000/permissions
```

---

## Políticas

Requieren **JWT Bearer Token**.
`POST /policies` y `GET /policies` además requieren rol `admin`.

Las políticas son conjuntos de reglas (condiciones `json-rules-engine`) que evalúan el
contexto de cada solicitud. Una política puede tener `effect: "allow"` o `effect: "deny"`.

### POST /policies

Crea una nueva política vinculada a una aplicación y permiso.

```bash
curl -s -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "appSlug": "uuid-app",
    "permissionCode": "reports:export",
    "conditions": {},
    "name": "Export solo en horario laboral",
    "effect": "allow",
    "priority": 100,
    "enabled": true,
    "description": "Permite exportar reportes de 8 a 18 hs"
  }'
```

**Campos del request**

| Campo            | Tipo             | Requerido | Descripción                                        |
|------------------|------------------|-----------|----------------------------------------------------|
| `appSlug`        | string           | Sí        | ID o slug de la aplicación                         |
| `permissionCode` | string           | Sí        | Código del permiso (`"resource:action"`)           |
| `conditions`     | object           | Sí        | Condiciones base (puede ser `{}`)                  |
| `name`           | string           | No        | Nombre descriptivo                                 |
| `effect`         | `"allow"\|"deny"` | No       | Efecto al cumplirse las reglas (default `"allow"`) |
| `priority`       | number (0–1000)  | No        | Mayor número = mayor prioridad (default 1)         |
| `enabled`        | boolean          | No        | Si la política está activa (default true)          |
| `description`    | string           | No        | Descripción larga                                  |

---

### GET /policies

Lista políticas de una aplicación con filtros.

```bash
curl -s "http://localhost:3000/policies?applicationId=uuid-app&effect=allow&isActive=true&page=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"
```

**Query params**

| Param           | Requerido | Descripción                       |
|-----------------|-----------|-----------------------------------|
| `applicationId` | Sí        | Filtrar por aplicación            |
| `type`          | No        | Tipo de política                  |
| `effect`        | No        | `"allow"` o `"deny"`              |
| `isActive`      | No        | `true` / `false`                  |
| `searchTerm`    | No        | Búsqueda por nombre               |
| `page`          | No        | Página (default 1)                |
| `limit`         | No        | Registros por página (default 20) |

---

### GET /policies/:id

```bash
curl -s http://localhost:3000/policies/uuid-policy \
  -H "Authorization: Bearer <accessToken>"
```

---

### PUT /policies/:id

Actualiza nombre, reglas o descripción de una política.

```bash
curl -s -X PUT http://localhost:3000/policies/uuid-policy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "Export horario laboral v2",
    "description": "Actualizada para incluir sábados hasta las 13 hs"
  }'
```

---

### DELETE /policies/:id

Soft-delete (desactiva sin borrar físicamente).

```bash
curl -s -X DELETE http://localhost:3000/policies/uuid-policy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{ "deletedBy": "uuid-admin" }'
```

**Respuesta 204** — Sin cuerpo.

---

### POST /policies/:id/reactivate

Reactiva una política desactivada.

```bash
curl -s -X POST http://localhost:3000/policies/uuid-policy/reactivate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{ "reactivatedBy": "uuid-admin" }'
```

**Respuesta 204** — Sin cuerpo.

---

### POST /policies/:id/rules

Añade una regla de evaluación a una política. Las reglas usan el formato
[json-rules-engine](https://github.com/CacheControl/json-rules-engine).

```bash
curl -s -X POST http://localhost:3000/policies/uuid-policy/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "condition": {
      "all": [
        { "fact": "context.hour", "operator": "greaterThanInclusive", "value": 8  },
        { "fact": "context.hour", "operator": "lessThanInclusive",    "value": 18 }
      ]
    },
    "operator": "AND",
    "priority": 10,
    "createdBy": "uuid-admin"
  }'
```

**Campos del request**

| Campo       | Tipo              | Requerido | Descripción                             |
|-------------|-------------------|-----------|-----------------------------------------|
| `condition` | object            | Sí        | Condición `json-rules-engine`           |
| `operator`  | `"AND"\|"OR"\|"NOT"` | No    | Operador lógico entre reglas            |
| `priority`  | number (≥ 0)      | No        | Orden de evaluación                     |
| `ruleType`  | string            | No        | Tipo personalizado                      |
| `createdBy` | string            | Sí        | UUID del creador                        |

---

### GET /policies/:id/rules

```bash
curl -s http://localhost:3000/policies/uuid-policy/rules \
  -H "Authorization: Bearer <accessToken>"
```

---

### DELETE /policies/rules/:ruleId

```bash
curl -s -X DELETE http://localhost:3000/policies/rules/uuid-rule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{ "deletedBy": "uuid-admin" }'
```

**Respuesta 204** — Sin cuerpo.

---

### POST /policies/:id/permissions/:permissionId

Vincula un permiso del catálogo a una política, opcionalmente con condiciones extra.

```bash
curl -s -X POST \
  http://localhost:3000/policies/uuid-policy/permissions/uuid-permiso \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "createdBy": "uuid-admin",
    "conditions": { "department": "IT" }
  }'
```

---

### GET /policies/:id/permissions

```bash
curl -s http://localhost:3000/policies/uuid-policy/permissions \
  -H "Authorization: Bearer <accessToken>"
```

---

### DELETE /policies/:id/permissions/:permissionId

```bash
curl -s -X DELETE \
  http://localhost:3000/policies/uuid-policy/permissions/uuid-permiso \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{ "deletedBy": "uuid-admin" }'
```

**Respuesta 204** — Sin cuerpo.

---

### POST /policies/validate-rule

Valida la estructura de una condición `json-rules-engine` antes de crearla.

```bash
curl -s -X POST http://localhost:3000/policies/validate-rule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "condition": {
      "all": [
        { "fact": "context.location", "operator": "equal", "value": "office" }
      ]
    }
  }'
```

**Respuesta 200**

```json
{ "isValid": true }
```

---

## Usuarios

Requieren **JWT Bearer Token** + rol `admin` (para `POST`, `GET`, `DELETE`).

### POST /users

```bash
curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "email": "jsmith@example.com",
    "name": "John Smith",
    "password": "SecurePass123!",
    "phone": "+5491123456789",
    "profile": {
      "department": "IT",
      "position": "Senior Developer"
    }
  }'
```

**Campos del request**

| Campo      | Tipo   | Requerido | Descripción                                |
|------------|--------|-----------|--------------------------------------------|
| `email`    | string | Sí        | Email único (válido)                       |
| `name`     | string | Sí        | Nombre completo                            |
| `password` | string | Sí        | Contraseña en texto plano (se hashea)      |
| `phone`    | string | No        | Teléfono de contacto                       |
| `profile`  | object | No        | Datos adicionales de perfil (libre)        |

---

### GET /users

```bash
curl -s "http://localhost:3000/users?isActive=true&searchTerm=smith&page=1&limit=10" \
  -H "Authorization: Bearer <accessToken>"
```

**Query params**

| Param        | Descripción                             |
|--------------|-----------------------------------------|
| `isActive`   | `true` / `false`                        |
| `searchTerm` | Búsqueda por nombre o email             |
| `page`       | Número de página (default 1)            |
| `limit`      | Registros por página (default 10)       |

---

### GET /users/:id

```bash
curl -s http://localhost:3000/users/uuid-usuario \
  -H "Authorization: Bearer <accessToken>"
```

---

### PATCH /users/:id

```bash
curl -s -X PATCH http://localhost:3000/users/uuid-usuario \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "John A. Smith",
    "phone": "+5491187654321",
    "profile": { "department": "Engineering" }
  }'
```

---

### DELETE /users/:id

Desactiva el usuario (soft delete). Requiere rol `admin`.

```bash
curl -s -X DELETE http://localhost:3000/users/uuid-usuario \
  -H "Authorization: Bearer <accessToken>"
```

**Respuesta 200**

```json
{ "message": "Usuario desactivado exitosamente" }
```

---

### GET /users/:id/policies

Devuelve las políticas directamente asignadas al usuario.

```bash
curl -s http://localhost:3000/users/uuid-usuario/policies \
  -H "Authorization: Bearer <accessToken>"
```

---

## Asignación usuario-política

Los endpoints `/user-policies` son **públicos** (sin guard en el controller).

### POST /user-policies

Asigna una política directamente a un usuario.

```bash
curl -s -X POST http://localhost:3000/user-policies \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "uuid-usuario",
    "policyId": "uuid-policy"
  }'
```

**Campos del request**

| Campo      | Tipo | Requerido | Descripción |
|------------|------|-----------|-------------|
| `userId`   | UUID | Sí        | ID del usuario    |
| `policyId` | UUID | Sí        | ID de la política |

---

### GET /user-policies/:userId

Devuelve todas las políticas asignadas a un usuario específico.

```bash
curl -s http://localhost:3000/user-policies/uuid-usuario
```

---

## Health check

### GET /health

Verifica el estado de la base de datos y el sistema.

```bash
curl -s http://localhost:3000/health
```

**Respuesta 200** (ejemplo)

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" }
  }
}
```

---

## Referencia de errores

| Código | Nombre            | Causa más frecuente                              |
|--------|-------------------|--------------------------------------------------|
| 400    | Bad Request       | Cuerpo del request inválido (validación fallida) |
| 401    | Unauthorized      | Token JWT ausente, expirado o inválido; API Key inválida |
| 403    | Forbidden         | El usuario no tiene el rol o permiso requerido   |
| 404    | Not Found         | Recurso no encontrado                            |
| 409    | Conflict          | Límite de sesiones concurrentes alcanzado        |
| 422    | Unprocessable     | Datos semánticamente incorrectos                 |
| 500    | Internal Error    | Error inesperado del servidor                    |

**Formato estándar de error**

```json
{
  "statusCode": 401,
  "message": "Credenciales inválidas",
  "error": "Unauthorized"
}
```
