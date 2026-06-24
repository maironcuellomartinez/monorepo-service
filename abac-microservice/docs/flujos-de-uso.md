# Flujos de uso — ABAC Microservice

Guía paso a paso de los escenarios más comunes.
Todos los curls asumen el servidor corriendo en `http://localhost:3000`.

---

## Flujo 1 — Setup inicial completo

Configura el sistema desde cero: aplicación → permisos → política → usuario → asignación.

### Paso 1 — Registrar la aplicación

```bash
APP=$(curl -s -X POST http://localhost:3000/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{
    "name": "Portal de Ventas",
    "environment": "production",
    "settings": {
      "maxConcurrentSessions": 2,
      "sessionTimeout": 3600,
      "maxUsers": 200
    },
    "createdBy": "uuid-admin"
  }')

APP_ID=$(echo $APP | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
API_KEY=$(echo $APP | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")

echo "APP_ID=$APP_ID"
echo "API_KEY=$API_KEY"
```

### Paso 2 — Crear los permisos del catálogo

```bash
# Permiso: leer pedidos
PERM_READ=$(curl -s -X POST http://localhost:3000/permissions \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "orders",
    "action": "read",
    "description": "Listar y ver pedidos",
    "category": "orders"
  }')
PERM_READ_ID=$(echo $PERM_READ | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Permiso: crear pedidos
PERM_CREATE=$(curl -s -X POST http://localhost:3000/permissions \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "orders",
    "action": "create",
    "description": "Crear nuevos pedidos",
    "category": "orders"
  }')
PERM_CREATE_ID=$(echo $PERM_CREATE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "PERM_READ_ID=$PERM_READ_ID"
echo "PERM_CREATE_ID=$PERM_CREATE_ID"
```

### Paso 3 — Crear una política

```bash
POLICY=$(curl -s -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d "{
    \"appSlug\": \"$APP_ID\",
    \"permissionCode\": \"orders:read\",
    \"conditions\": {},
    \"name\": \"Lectura de pedidos\",
    \"effect\": \"allow\",
    \"priority\": 100
  }")
POLICY_ID=$(echo $POLICY | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "POLICY_ID=$POLICY_ID"
```

### Paso 4 — Agregar una regla de contexto a la política

La siguiente regla permite acceso únicamente en horario laboral (8 a 18 hs).

```bash
curl -s -X POST http://localhost:3000/policies/$POLICY_ID/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{
    "condition": {
      "all": [
        { "fact": "context.hour", "operator": "greaterThanInclusive", "value": 8  },
        { "fact": "context.hour", "operator": "lessThanInclusive",    "value": 18 }
      ]
    },
    "priority": 10,
    "createdBy": "uuid-admin"
  }'
```

### Paso 5 — Vincular el permiso a la política

```bash
curl -s -X POST \
  http://localhost:3000/policies/$POLICY_ID/permissions/$PERM_READ_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{ "createdBy": "uuid-admin" }'
```

### Paso 6 — Crear un usuario

```bash
USER=$(curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{
    "email": "vendedor@example.com",
    "name": "María López",
    "password": "Ventas2026!",
    "profile": { "department": "Sales" }
  }')
USER_ID=$(echo $USER | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "USER_ID=$USER_ID"
```

### Paso 7 — Asignar la política al usuario

```bash
curl -s -X POST http://localhost:3000/user-policies \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"policyId\": \"$POLICY_ID\"
  }"
```

---

## Flujo 2 — Autenticación y gestión de sesión

### Login

```bash
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "vendedor@example.com",
    "password": "Ventas2026!"
  }')

ACCESS_TOKEN=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
REFRESH_TOKEN=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['refreshToken'])")

echo "ACCESS_TOKEN=$ACCESS_TOKEN"
echo "REFRESH_TOKEN=$REFRESH_TOKEN"
```

### Verificar token JWT

```bash
curl -s -X POST http://localhost:3000/auth/validate-token \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$ACCESS_TOKEN\"}"
```

### Renovar tokens (antes de que el accessToken expire)

```bash
TOKENS=$(curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

ACCESS_TOKEN=$(echo $TOKENS | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
REFRESH_TOKEN=$(echo $TOKENS | python3 -c "import sys,json; print(json.load(sys.stdin)['refreshToken'])")
```

### Logout

```bash
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

---

## Flujo 3 — Evaluación de acceso

### Verificación simple

```bash
curl -s -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"applicationId\": \"$APP_ID\",
    \"resource\": \"orders\",
    \"action\": \"read\",
    \"context\": {
      \"hour\": 10,
      \"location\": \"office\"
    }
  }"
# {"granted": true}  ← dentro del horario permitido

curl -s -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"applicationId\": \"$APP_ID\",
    \"resource\": \"orders\",
    \"action\": \"read\",
    \"context\": { \"hour\": 22 }
  }"
# {"granted": false}  ← fuera del horario
```

### Pre-carga de permisos al iniciar pantalla (batch)

```bash
curl -s -X POST http://localhost:3000/abac/batch-evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d "{
    \"requests\": [
      { \"userId\": \"$USER_ID\", \"applicationId\": \"$APP_ID\", \"resource\": \"orders\",    \"action\": \"read\",   \"context\": {\"hour\": 10} },
      { \"userId\": \"$USER_ID\", \"applicationId\": \"$APP_ID\", \"resource\": \"orders\",    \"action\": \"create\", \"context\": {\"hour\": 10} },
      { \"userId\": \"$USER_ID\", \"applicationId\": \"$APP_ID\", \"resource\": \"dashboard\", \"action\": \"view\",   \"context\": {} }
    ]
  }"
```

---

## Flujo 4 — Límite de sesiones concurrentes

Cuando `maxConcurrentSessions` está configurado en la aplicación o en el rol del
usuario, el segundo login (sin cerrar el primero) devuelve HTTP 409.

```bash
# Primera sesión → OK
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "vendedor@example.com", "password": "Ventas2026!"}'
# → 200 { accessToken, refreshToken, ... }

# Segunda sesión (sin logout) → BLOQUEADO
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "vendedor@example.com", "password": "Ventas2026!"}'
# → 409 {
#       "statusCode": 409,
#       "message": "Ya tienes 1 sesión(es) activa(s). Cierra sesión antes de iniciar una nueva.",
#       "error": "Conflict"
#     }

# Hacer logout primero
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"

# Ahora el login funciona de nuevo
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "vendedor@example.com", "password": "Ventas2026!"}'
# → 200 OK
```

---

## Flujo 5 — Políticas de denegación explícita

Un `effect: "deny"` con mayor prioridad que el `allow` bloquea el acceso
independientemente de los permisos del usuario.

```bash
# Crear política de denegación fuera de la red corporativa
DENY_POLICY=$(curl -s -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d "{
    \"appSlug\": \"$APP_ID\",
    \"permissionCode\": \"orders:create\",
    \"conditions\": {},
    \"name\": \"Bloquear creación fuera de oficina\",
    \"effect\": \"deny\",
    \"priority\": 200
  }")
DENY_POLICY_ID=$(echo $DENY_POLICY | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Agregar regla: IP no es de la red interna
curl -s -X POST http://localhost:3000/policies/$DENY_POLICY_ID/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{
    "condition": {
      "all": [
        {
          "fact": "context.location",
          "operator": "notEqual",
          "value": "office"
        }
      ]
    },
    "createdBy": "uuid-admin"
  }'

# Asignar la política de denegación al mismo usuario
curl -s -X POST http://localhost:3000/user-policies \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\", \"policyId\": \"$DENY_POLICY_ID\"}"

# Evaluar: desde fuera de la oficina → denegado
curl -s -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"applicationId\": \"$APP_ID\",
    \"resource\": \"orders\",
    \"action\": \"create\",
    \"context\": { \"location\": \"home\", \"hour\": 10 }
  }"
# {"granted": false}

# Evaluar: desde la oficina → permitido
curl -s -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"applicationId\": \"$APP_ID\",
    \"resource\": \"orders\",
    \"action\": \"create\",
    \"context\": { \"location\": \"office\", \"hour\": 10 }
  }"
# {"granted": true}
```

---

## Flujo 6 — Gestión de políticas existentes

```bash
# Ver todas las políticas de la app
curl -s "http://localhost:3000/policies?applicationId=$APP_ID" \
  -H "Authorization: Bearer <accessToken-admin>"

# Ver reglas de una política
curl -s http://localhost:3000/policies/$POLICY_ID/rules \
  -H "Authorization: Bearer <accessToken-admin>"

# Validar una condición antes de crearla
curl -s -X POST http://localhost:3000/policies/validate-rule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{
    "condition": {
      "any": [
        { "fact": "context.country", "operator": "equal", "value": "AR" },
        { "fact": "context.country", "operator": "equal", "value": "MX" }
      ]
    }
  }'

# Desactivar una política temporalmente
curl -s -X DELETE http://localhost:3000/policies/$POLICY_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{"deletedBy": "uuid-admin"}'

# Reactivarla
curl -s -X POST http://localhost:3000/policies/$POLICY_ID/reactivate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken-admin>" \
  -d '{"reactivatedBy": "uuid-admin"}'
```

---

## Flujo 7 — Autenticación por API Key (backend-to-backend)

Para servicios internos que no pueden hacer login interactivo.

```bash
# 1. Validar credenciales y obtener sesión
SESSION=$(curl -s -X POST http://localhost:3000/auth/validate-api-key \
  -H "Content-Type: application/json" \
  -d "{
    \"apiKey\": \"$API_KEY\",
    \"apiSecret\": \"<apiSecret-en-texto-plano>\"
  }")

B2B_TOKEN=$(echo $SESSION | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Usar el token para endpoints JWT
curl -s http://localhost:3000/users \
  -H "Authorization: Bearer $B2B_TOKEN"
```

---

---

## Flujo 8 — Registro y autenticación de usuario vía Microsoft Entra ID (Azure AD)

Este flujo describe el ciclo completo desde que un usuario se autentica con su cuenta corporativa de Azure AD hasta que el sistema ABAC evalúa sus permisos.

> **Puerto correcto del ABAC:** `http://localhost:3005`
> El API Gateway corre en `:3000` y actúa como proxy hacia ABAC en `:3005`.

---

### Diagrama de secuencia

```
Browser / App
    │  1. Inicia autenticación MSAL / OAuth2 Authorization Code
    ▼
Microsoft Entra ID (Azure AD)
    │  2. Retorna access_token (JWT RS256, iss = login.microsoftonline.com)
    ▼
API Gateway :3000
    │  3. Recibe Authorization: Bearer <entra_token>
    │  4. JwtGuard detecta iss de Entra ID (sin llamada a red)
    │  5. POST /auth/validate-entra  → ABAC :3005  (x-api-key: <ABAC_API_KEY>)
    ▼
ABAC Microservice :3005
    │  6. Valida firma RS256 contra JWKS de Microsoft
    │  7. Lazy sync del usuario (ver detalle abajo)
    │  8. Retorna { valid, oid, email, userId, permissions[] }
    ▼
API Gateway :3000
    │  9. Puebla request.user con userId + permissions
    │  10. Deja pasar el request al controlador
    ▼
Monolith :3001  /  respuesta al cliente
```

---

### Paso 0 — Requisitos previos (configuración de entorno)

En `apps/abac-microservice/.env.development`:

```env
AZURE_TENANT_ID=<tenant-id-del-directorio-azure>
AZURE_CLIENT_ID=<client-id-de-la-app-registration>
# Opcional — si se quiere sobreescribir el JWKS URI
# AZURE_JWKS_URI=https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys
```

En `apps/api-gateway/.env.development`:

```env
ABAC_URL=http://localhost:3005
ABAC_API_KEY=<api-key-generado-por-el-seed>
ABAC_APP_ID=<app-id-de-event-corner>
```

> Si `AZURE_TENANT_ID` o `AZURE_CLIENT_ID` no están configurados, el servicio `EntraIdService` arranca en modo deshabilitado y lanza error en el primer intento de validación.

---

### Paso 1 — El usuario se autentica en Azure AD

El frontend usa MSAL.js (u otra librería OAuth2) para obtener un `access_token`:

```
GET https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize
  ?client_id=<AZURE_CLIENT_ID>
  &response_type=code
  &scope=openid profile email
  &redirect_uri=https://app.eventcorner.com/callback
```

Azure AD retorna un JWT firmado con RS256 cuyo `iss` es:
```
https://login.microsoftonline.com/<tenant>/v2.0
```

---

### Paso 2 — El frontend llama al API Gateway

```bash
curl -X GET http://localhost:3000/incidents \
  -H "Authorization: Bearer <entra_access_token>"
```

---

### Paso 3 — JwtGuard detecta y delega la validación

El `JwtGuard` del API Gateway hace un `jwt.decode()` local (sin verificar firma) para leer el `iss`. Si contiene `login.microsoftonline.com`, clasifica el token como Entra ID y llama a ABAC:

```bash
# Lo que hace internamente el API Gateway:
POST http://localhost:3005/auth/validate-entra
x-api-key: <ABAC_API_KEY>
Content-Type: application/json

{
  "token": "<entra_access_token>",
  "applicationId": "<ABAC_APP_ID>"
}
```

---

### Paso 4 — ABAC valida JWKS y hace lazy sync del usuario

ABAC obtiene la clave pública de Microsoft (`kid` del header del token → JWKS endpoint), verifica la firma RS256 y luego ejecuta el **lazy sync**:

```
¿Existe usuario con entraId = payload.oid?
  └─ SÍ  → actualiza lastLoginAt, carga roles y permisos
  └─ NO  → ¿existe usuario con mismo email?
              └─ SÍ  → asocia el oid al usuario existente
              └─ NO  → crea nuevo usuario:
                          accountType = 'user'
                          passwordHash = null   (no puede hacer login local)
                          email / firstName / lastName / username = del token
```

El usuario recién creado **no tiene roles ni permisos** hasta que un admin los asigne desde el dashboard (ver Paso 5).

**Respuesta de ABAC al gateway:**

```json
{
  "valid": true,
  "oid": "azure-object-id-del-usuario",
  "email": "juan.perez@empresa.com",
  "userId": "uuid-interno-abac",
  "permissions": ["incident:create", "incident:read", "corner:list"]
}
```

---

### Paso 5 — Asignar roles al usuario (primera vez)

Un administrador debe asignar al menos un rol al usuario recién sincronizado desde el dashboard ABAC o vía API:

```bash
# 1. Buscar el userId del usuario sincronizado
curl -X GET "http://localhost:3005/users?search=juan.perez@empresa.com" \
  -H "Authorization: Bearer <admin_jwt>"

# 2. Asignar rol 'employee' al usuario en la aplicación Event Corner
curl -X POST http://localhost:3005/users/<USER_ID>/roles \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "roleId": "<role-id-employee>",
    "applicationId": "<APP_ID>"
  }'
```

A partir de ahora, cada vez que el usuario se autentique vía Entra ID, ABAC retornará sus permisos actualizados.

---

### Paso 6 — Verificación de acceso (evaluación ABAC)

Con el `userId` obtenido del sync, el API Gateway puede evaluar permisos:

```bash
curl -X POST http://localhost:3005/abac/can-access \
  -H "x-api-key: <ABAC_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<USER_ID>",
    "applicationId": "<APP_ID>",
    "resource": "incident",
    "action": "create",
    "context": {
      "cornerId": "<uuid-del-corner>",
      "hour": 10
    }
  }'

# Respuesta:
# { "granted": true }   ← usuario tiene el permiso y las condiciones se cumplen
# { "granted": false }  ← permiso denegado (sin rol, deny policy, condición no cumplida)
```

---

### Paso 7 — Evaluación batch (pre-carga de permisos en pantalla)

```bash
curl -X POST http://localhost:3005/abac/batch-evaluate \
  -H "x-api-key: <ABAC_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      { "userId": "<USER_ID>", "applicationId": "<APP_ID>", "resource": "incident", "action": "create",  "context": {} },
      { "userId": "<USER_ID>", "applicationId": "<APP_ID>", "resource": "incident", "action": "list",    "context": {} },
      { "userId": "<USER_ID>", "applicationId": "<APP_ID>", "resource": "corner",   "action": "read",    "context": {} }
    ]
  }'

# Respuesta:
# [
#   { "resource": "incident", "action": "create",  "granted": true  },
#   { "resource": "incident", "action": "list",    "granted": true  },
#   { "resource": "corner",   "action": "read",    "granted": false }
# ]
```

---

### Testing local sin Azure AD (solo development)

Cuando `NODE_ENV=development`, está disponible un endpoint que simula el sync de Entra ID sin necesidad de un token real:

```bash
curl -X POST http://localhost:3005/auth/dev/simulate-entra \
  -H "Content-Type: application/json" \
  -d '{
    "oid": "test-oid-juan-perez",
    "email": "juan.perez@empresa.com",
    "name": "Juan Pérez",
    "applicationId": "<APP_ID>"
  }'

# Respuesta idéntica al flujo real:
# {
#   "valid": true,
#   "oid": "test-oid-juan-perez",
#   "email": "juan.perez@empresa.com",
#   "userId": "<uuid-creado-o-existente>",
#   "permissions": [...]
# }
```

> Este endpoint retorna `403 Forbidden` en staging y production.

---

### Comportamiento del lazy sync — resumen

| Situación | Resultado |
|---|---|
| Primera vez que el usuario se autentica | Se crea el usuario en ABAC sin roles ni permisos |
| Usuario ya existe por email (creado manualmente) | Se asocia el `oid` al usuario existente, conserva sus roles |
| Usuario ya existe con `oid` diferente para el mismo email | Error `409 Conflict` — posible conflicto de tenants |
| Usuario sin roles asignados | `canAccess()` retorna `false` para cualquier recurso |
| Admin asigna roles después del primer sync | Los permisos se aplican en la siguiente llamada a `validate-entra` |

---

## Referencia rápida de headers

| Situación | Header requerido |
|---|---|
| Endpoints `/abac/*` (evaluación) | `x-api-key: <apiKey>` |
| Endpoints JWT (`/users`, `/roles`, `/policies`, etc.) | `Authorization: Bearer <jwt-admin>` |
| `POST /auth/admin/login` | Sin header |
| `POST /auth/m2m-token` | Sin header |
| `POST /auth/validate-entra` | `x-api-key: <apiKey>` |
| `POST /auth/dev/simulate-entra` | Sin header (solo development) |
| `POST /auth/oauth/token` | Sin header |

## Operadores disponibles en condiciones de reglas

| Operador                 | Descripción                              |
|--------------------------|------------------------------------------|
| `equal`                  | Igual a                                  |
| `notEqual`               | Distinto de                              |
| `lessThan`               | Menor que                                |
| `lessThanInclusive`      | Menor o igual que                        |
| `greaterThan`            | Mayor que                                |
| `greaterThanInclusive`   | Mayor o igual que                        |
| `in`                     | Incluido en un array                     |
| `notIn`                  | No incluido en un array                  |
| `contains`               | Array contiene el valor                  |
| `doesNotContain`         | Array no contiene el valor               |

**Estructura de condición**

```json
{
  "all": [
    { "fact": "<ruta.del.atributo>", "operator": "<operador>", "value": <valor> }
  ]
}
```

Use `"all"` para AND lógico o `"any"` para OR lógico. Se pueden anidar.

**Facts disponibles en el contexto**

Todos los campos del objeto `context` enviado en el request se exponen como
`context.<campo>`. Por ejemplo:

- `context.hour` → hora del día (0–23)
- `context.location` → `"office"`, `"home"`, etc.
- `context.ipAddress` → IP del cliente
- `context.country` → código ISO del país
- `context.mfaVerified` → `true` / `false`
- `context.department` → departamento del usuario
