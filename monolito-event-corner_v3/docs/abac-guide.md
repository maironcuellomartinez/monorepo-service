# ABAC — Guía de Control de Acceso

**ABAC** (Attribute-Based Access Control) es el sistema de autorización central del ecosistema Event Corner v3.
Evalúa si un usuario puede realizar una `action` sobre un `resource` dentro de una `application`,
combinando **roles**, **permisos** y **políticas con reglas contextuales**.

Motor de reglas: [`json-rules-engine`](https://github.com/CacheControl/json-rules-engine)
Servicio: `abac-microservice` `:3005`

---

## Modelo de datos

```
Application
  └─ Role          (pertenece a una aplicación)
       └─ Permission  (resource + action)
  └─ Policy        (pertenece a una aplicación, effect: allow | deny)
       ├─ PolicyPermission  (permisos que cubre esta política)
       └─ PolicyRule        (condiciones json-rules-engine, prioridad)
  └─ User
       ├─ UserApplication   (activa al usuario en la app, guarda membership + attributes)
       ├─ UserRole          (asigna rol al usuario dentro de la app)
       └─ UserPolicyAssignment (asigna política directa, sin pasar por rol)
```

---

## Flujo de evaluación — `canAccess(userId, appId, resource, action, context)`

```
1. Cache hit?          → retorna resultado inmediatamente (TTL 1h)
2. UserApplication?    → ¿el usuario está activo en esta app?  → DENY si no existe
3. getUserPermissions  → ¿el rol/política del usuario cubre resource:action?
                         si no existe o effect = deny → DENY
4. getRelevantPolicies → políticas activas para resource:action, ordenadas por priority DESC
   - sin políticas     → ALLOW (permiso existe, sin restricciones adicionales)
   - con políticas     → evaluar reglas (json-rules-engine)
       - primera política cuyos rules TODOS pasan → retorna su effect (allow/deny)
       - ninguna matcheó → ALLOW (permiso base prevalece)
5. Guardar en caché y retornar
```

> **Short-circuit**: en cada paso, si la condición falla se guarda `false` en caché y se retorna
> sin ejecutar los pasos siguientes.

---

## Motor de evaluación — internals

### Paso 2: resolución de permisos (`getUserPermissions`)

Construye un `Map<"resource:action", { effect, constraints }>` con los permisos efectivos del usuario.

**Fuente 1 — Roles** (siempre se ejecuta):
```sql
SELECT rp.*
FROM role_permissions rp
  INNER JOIN roles r        ON rp.roleId = r.id
  INNER JOIN permissions p  ON rp.permissionId = p.id
  INNER JOIN user_roles ur  ON ur.roleId = r.id
WHERE ur.userId    = :userId
  AND ur.isActive  = true
  AND r.applicationId = :appId
  AND r.isActive   = true
  AND rp.isActive  = true
  AND p.isActive   = true
  AND p.resource   = :resource   -- filtrado si se especifica
  AND p.action     = :action     -- filtrado si se especifica
```

`RolePermission.effect` puede ser `'allow'` o `'deny'`. Si el rol tiene el permiso con
`effect = 'deny'`, el paso 2 devuelve eso y el acceso se deniega **antes de evaluar políticas**.

**Fuente 2 — Políticas directas** (solo si no se especificó resource/action):
Añade al map los permisos cubiertos por las políticas de la aplicación que no estén ya en el map
por roles. Siempre con `effect = 'allow'`.

**Regla de precedencia entre fuentes:**
Los permisos de **rol tienen prioridad** sobre los de política directa:
si el mismo `resource:action` aparece en ambas fuentes, se usa el del rol (ya está en el map).

```
RolePermission.effect = 'deny'  →  acceso DENEGADO en el paso 2 (no llega a políticas)
RolePermission.effect = 'allow' →  continúa al paso 3 (evaluación de políticas)
no está en el map               →  acceso DENEGADO en el paso 2
```

---

### Paso 3: evaluación de políticas (`getRelevantPolicies` + `evaluatePolicies`)

#### 3a — Selección de políticas relevantes

```sql
SELECT policy.*
FROM policies policy
  INNER JOIN policy_permissions pp  ON pp.policyId = policy.id
  INNER JOIN permissions p          ON pp.permissionId = p.id
  LEFT JOIN  policy_rules rule      ON rule.policyId = policy.id AND rule.isActive = true
WHERE policy.applicationId = :appId
  AND policy.isActive       = true
  AND p.resource            = :resource
  AND p.action              = :action
  AND p.isActive            = true
ORDER BY policy.priority DESC
```

Solo se traen políticas que **cubran el par resource:action** solicitado.
Las políticas se ordenan por `priority DESC` — la de mayor número se evalúa primero.

#### 3b — Algoritmo de evaluación (primera que matchea gana)

```
Para cada política (en orden de priority DESC):
  ├─ Sin reglas activas → aplicar policy.effect directamente → RETORNAR
  │
  ├─ Con reglas:
  │    1. Ordenar reglas por rule.priority DESC
  │    2. Filtrar: rule.isActive = true AND rule.isValidCondition() = true
  │    3. Si no quedan reglas válidas → SKIP (continuar a la siguiente política)
  │    4. Crear un Engine de json-rules-engine
  │    5. Añadir TODAS las reglas válidas al Engine
  │    6. engine.run(facts)
  │    7. ¿events.length === validRules.length?
  │         SÍ → TODAS las reglas pasaron → aplicar policy.effect → RETORNAR
  │         NO → alguna regla falló → SKIP (continuar a la siguiente política)
  │
Ninguna política matcheó → retornar null → canAccess interpreta null como ALLOW
```

> `events.length === validRules.length` es la condición de "todas las reglas pasaron":
> json-rules-engine emite un evento por cada regla que cumple su condición, así que
> si la cantidad de eventos iguala la cantidad de reglas, todas se cumplieron.

#### 3c — Prioridades de políticas y qué significa cada valor

Las prioridades no tienen significado absoluto; lo que importa es el **orden relativo**.
La convención usada en Event Corner v3:

| Rango | Tipo | Propósito |
|---|---|---|
| 150 – 200 | **Deny** | Bloqueos de seguridad. Evaluados primero, siempre ganan sobre cualquier allow. |
| 60 – 100 | **Allow sin reglas** | Roles administrativos/plataforma. Acceso directo sin condición contextual. |
| 20 – 40 | **Allow con reglas** | Roles operativos. Acceso condicionado al estado del membership del usuario. |
| 10 | **Allow sin reglas** | Readonly. El menor allow, evaluado al final. |

Ejemplo con `employee` intentando `incident:delete`:

```
Políticas que cubren incident:delete (ordenadas por priority):

  priority 200  "Employee — Deny Operativas Destructivas"  effect=deny
    → reglas: ninguna (aplica efecto directo)
    → MATCH → retorna DENY ← fin, no se evalúan más políticas

  priority 20   "Employee Allow"  effect=allow
    → nunca se llega aquí
```

Ejemplo con `technician` intentando `incident:take`:

```
Políticas que cubren incident:take (ordenadas por priority):

  priority 40   "Technician Allow"  effect=allow
    → reglas: [{ "all": [{ fact:"membership", path:"$.type", operator:"equal", value:"member" }] }]
    → membership.type = 'member'? → SÍ → MATCH → retorna ALLOW

  priority 40   "Technician Allow"  effect=allow
    → membership.type = 'member'? → NO → SKIP

  Ninguna matcheó → ALLOW (permiso base)
```

#### 3d — PolicyRule: dos niveles de prioridad

Dentro de una política puede haber **múltiples reglas** (`policy_rules`), cada una con su
propio campo `priority`. Este campo solo afecta el **orden de evaluación dentro del Engine**,
no el resultado (porque todas deben pasar):

```
rule.priority DESC → el Engine evalúa las condiciones más "caras" o importantes primero,
                     lo que permite cortocircuitar más rápido si una falla.
```

Esquema de columnas relevantes de `policy_rules`:

| Campo | Tipo | Descripción |
|---|---|---|
| `condition` | JSON | Estructura json-rules-engine (`all`/`any`/`not` + `fact`/`operator`/`value`/`path`) |
| `operator` | ENUM | `AND` \| `OR` \| `NOT` — operador lógico de la regla (metadata, no lo usa el engine directamente) |
| `priority` | int | Orden de evaluación dentro del Engine de la política |
| `ruleType` | varchar | Etiqueta semántica (p. ej. `'membership'`, `'time'`, `'role'`) |

---

### Estructura de una condición (json-rules-engine)

El campo `condition` de cada `PolicyRule` debe seguir el formato de json-rules-engine:

```
RuleCondition = CompoundCondition | BasicCondition

CompoundCondition:
  { "all": BasicCondition[] }   ← AND lógico: todas deben cumplirse
  { "any": BasicCondition[] }   ← OR lógico: al menos una debe cumplirse
  { "not": BasicCondition  }    ← negación

BasicCondition:
  {
    "fact":     string,   // top-level key del facts object: "user", "membership", "context", "application"
    "path":     string,   // JSONPath dentro del fact: "$.type", "$.roles", "$.isExpired"
    "operator": string,   // ver tabla de operadores abajo
    "value":    any       // valor a comparar
  }
```

**Operadores disponibles de json-rules-engine:**

| Operador                 | Significado                                             |
|--------------------------|---------------------------------------------------------|
| `equal`                  | `fact === value`                                        |
| `notEqual`               | `fact !== value`                                        |
| `lessThan`               | `fact < value`                                          |
| `lessThanInclusive`      | `fact <= value`                                         |
| `greaterThan`            | `fact > value`                                          |
| `greaterThanInclusive`   | `fact >= value`                                         |
| `in`                     | `value.includes(fact)` — el fact está en el array value |
| `notIn`                  | `!value.includes(fact)`                                 |
| `contains`               | `fact.includes(value)` — el array fact contiene value   |
| `doesNotContain`         | `!fact.includes(value)`                                 |

**Validación en runtime** (`PolicyRule.isValidCondition()`):
Antes de añadir una regla al Engine, se verifica que tenga la estructura correcta
(`fact` string, `operator` string, `value` definido). Las reglas inválidas se filtran
y no se pasan al Engine — si todas las reglas de una política son inválidas, la política
se salta (`SKIP`) y se evalúa la siguiente.

---

## Roles

### Jerarquía y nivel de acceso

| Rol | Nivel | Descripción |
|---|---|---|
| `super-admin` | Total | Todos los permisos del sistema. Usado únicamente por operaciones de plataforma. |
| `admin` | Configuración | Gestión de corners, lockers, usuarios, empresas y configuración. Sin operativa directa de incidencias. |
| `manager` | Operación | Opera incidencias y solicitudes. Lectura de configuración. Sin acceso a eliminación de entidades críticas. |
| `technician` | Atención | Operativa completa sobre incidencias (crear, tomar, cambiar estado, validar, eliminar). Sin acceso a configuración. |
| `employee` | Usuario final | Crea y consulta sus propias incidencias y solicitudes. Puede cancelar y cerrar las suyas. |
| `readonly` | Auditoría | Solo lectura en todos los recursos. Sin ninguna acción de escritura. |

### Constraints por rol

Los constraints se almacenan en el campo `constraints` de la tabla `roles` (JSON).
Afectan la lógica de sesión/autenticación del microservicio.

| Rol | maxSessions | sessionTimeout | canDeactivateSelf |
|---|---|---|---|
| `super-admin` | 1 | 1 800 s (30 min) | No |
| `admin` | 3 | 14 400 s (4 h) | No |
| `manager` | 5 | 28 800 s (8 h) | No |
| `technician` | 3 | 28 800 s (8 h) | No |
| `employee` | 2 | 14 400 s (4 h) | Sí |
| `readonly` | 2 | 28 800 s (8 h) | No |

- **maxSessions**: cantidad máxima de tokens de sesión activos simultáneamente.
- **sessionTimeout**: segundos de inactividad antes de que la sesión expire.
- **canDeactivateSelf**: si el usuario puede deshabilitar su propia cuenta.

---

## Permisos

Los permisos son la unidad mínima de acceso: `resource:action`.
Cada permiso tiene un **weight** (peso) que representa su sensibilidad.

### Escala de pesos

| Peso | Significado | Ejemplos |
|---|---|---|
| 5 | Lectura básica | `read`, `list` |
| 10 | Operación estándar | `create`, `sync`, `create-virtual` |
| 15 | Operación con impacto | `list-all`, `take`, `release`, `assign`, `deliver` |
| 20 | Cambios de estado o cierre | `change-status`, `validate`, `reopen`, `expire`, `export` |
| 25 | Modificación de configuración | `update` |
| 30 | Creación de configuración | `create` (entidades de configuración) |
| 40 | Destrucción | `delete` |

> El peso no afecta la evaluación en runtime. Es metadata para razonamiento y auditoría.

### Permisos por dominio (69 en total)

| Dominio | Acciones disponibles |
|---|---|
| `incident` | `create` `read` `list` `list-all` `deliver` `take` `release` `change-status` `validate` `reopen` `delete` |
| `corner` | `create` `read` `list` `update` `delete` `manage-schedules` `assign-technician` |
| `schedule` | `create` `read` `list` `update` `delete` `assign-technicians` |
| `slot` | `read` `list` `expire` |
| `locker` | `create` `read` `list` `update` `delete` `assign` `release` |
| `request` | `create` `read` `list` `list-all` `change-status` `update-status` `delete` |
| `issue-type` | `create` `read` `list` `update` `delete` |
| `company` | `create` `read` `list` `update` `delete` |
| `technician` | `create` `read` `list` `update` `delete` |
| `user` | `create` `read` `list` `update` `delete` |
| `device` | `read` `sync` `create-virtual` `complete-virtual` |
| `availability` | `read` `read-technicians` |
| `report` | `view` `export` |

### Permisos por rol (resumen)

#### super-admin
Todos los 69 permisos.

#### admin
Configuración completa + gestión de incidencias (sin `create` ni `take`/`release`):
- `incident`: read, list, list-all, deliver, change-status, validate, reopen, delete
- `corner` / `schedule` / `slot`: CRUD completo + assign
- `locker`: CRUD completo + assign/release
- `request`: read, list, list-all, change-status, update-status, delete
- `issue-type` / `company`: CRUD completo
- `technician` / `user`: CRUD completo
- `device`: read, sync, complete-virtual
- `availability`: read, read-technicians
- `report`: view, export

#### manager
Operación sin configuración ni eliminación de entidades críticas:
- `incident`: create, read, list, list-all, deliver, take, release, change-status, validate, reopen
- `corner` / `schedule`: lectura
- `slot`: read, list, expire
- `locker`: read, list, assign, release
- `request`: create, read, list, list-all, change-status, update-status
- `issue-type` / `company`: lectura
- `technician`: lectura + asignación a corners
- `user`: read
- `device`: read, sync, create-virtual, complete-virtual
- `availability`: read, read-technicians
- `report`: view

#### technician
Operativa completa de incidencias:
- `incident`: create, read, list, list-all, deliver, **take**, release, change-status, validate, reopen, **delete**
- `corner` / `schedule` / `slot`: lectura
- `locker`: read, assign, release
- `request`: read, list, change-status
- `issue-type`: lectura
- `device`: read, sync
- `availability`: read, read-technicians

#### employee
Solo operaciones propias:
- `incident`: create, read, list, change-status, validate
- `request`: create, read, list
- `corner` / `schedule` / `slot`: lectura (para reservar)
- `issue-type`: lectura
- `device`: read, create-virtual
- `availability`: read

#### readonly
Solo lectura en todos los dominios:
- read/list de: incident, corner, schedule, slot, locker, request, issue-type, company, technician, user, device, availability, report:view

---

## Políticas

Las políticas actúan como capa de control contextual **sobre** los permisos.
Un permiso concede acceso en abstracto; una política puede restringirlo según el contexto en runtime.

### Cómo funciona la prioridad

```
priority más alto → se evalúa primero
primera política que matchea → su effect es el resultado final (allow o deny)
ninguna matchea → ALLOW (el permiso base prevalece)
```

> Regla clave: las políticas **deny de mayor prioridad** siempre se evalúan antes que
> las **allow de menor prioridad**, por lo que un deny "gana" si sus condiciones se cumplen.

### Políticas allow (por rol)

| Rol | Prioridad | Condición contextual |
|---|---|---|
| `super-admin` | 100 | Sin reglas — efecto apply directo |
| `admin` | 80 | Sin reglas — efecto apply directo |
| `manager` | 60 | Sin reglas — efecto apply directo |
| `technician` | 40 | `membership.type = 'member'` |
| `employee` | 20 | `membership.isExpired = false` |
| `readonly` | 10 | Sin reglas — efecto apply directo |

Las reglas de `technician` y `employee` hacen que el acceso dependa del estado del membership
del usuario en la aplicación (campo `UserApplication.membershipType` / `membershipExpiresAt`).

### Políticas deny (guardianes de seguridad)

| Política | Prioridad | Rol | Permisos bloqueados |
|---|---|---|---|
| Employee — Deny Operaciones Destructivas | **200** | employee | Todos los `*:delete` |
| Technician — Deny Eliminación de Solicitudes | **180** | technician | `request:delete` |
| Manager — Deny Eliminación de Entidades Críticas | **150** | manager | `user:delete`, `company:delete` |

> Las deny tienen prioridad 150–200, mientras que las allow tienen 10–100.
> Esto garantiza que un deny **siempre** se evalúa antes que cualquier allow.

#### ¿Por qué deny si el rol ya no tiene el permiso?

Las políticas deny existen como **guarda de seguridad futura**: si en algún momento se añade
accidentalmente un permiso a un rol (p. ej. `employee:delete`), la política deny lo bloqueará
sin necesidad de auditar el código. Es defensa en profundidad.

---

## Facts disponibles en las reglas

Cuando se evalúan las políticas, el engine recibe los siguientes facts:

```jsonc
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "username",
    "profile": {},          // datos adicionales del perfil
    "attributes": {},       // atributos custom de UserApplication
    "roles": ["technician"] // nombres de los roles activos del usuario
  },
  "application": {
    "id": "uuid",
    "name": "Event Corner",
    "environment": "production"
  },
  "membership": {
    "type": "member",       // p. ej. 'member', 'guest', 'trial'
    "expiresAt": "...",
    "isExpired": false
  },
  "context": {
    // campos opcionales pasados por el llamador (ip, hora, etc.)
    "timestamp": "2026-03-17T..."
  }
}
```

### Ejemplos de condiciones válidas (json-rules-engine)

```jsonc
// Verificar que el usuario sea 'member'
{ "all": [{ "fact": "membership", "path": "$.type", "operator": "equal", "value": "member" }] }

// Verificar que el membership no esté expirado
{ "all": [{ "fact": "membership", "path": "$.isExpired", "operator": "equal", "value": false }] }

// Verificar que el usuario tenga un rol específico
{ "all": [{ "fact": "user", "path": "$.roles", "operator": "contains", "value": "technician" }] }

// Restringir acceso por horario (contexto pasado por el llamador)
{
  "all": [
    { "fact": "context", "path": "$.hour", "operator": "greaterThanInclusive", "value": 8 },
    { "fact": "context", "path": "$.hour", "operator": "lessThan", "value": 18 }
  ]
}
```

---

## Caché

Cada decisión de acceso se cachea en Redis con la clave:

```
abac_granted:{userId}:{appId}:{resource}:{action}  →  boolean  (TTL: 1h)
```

Para invalidar cuando se modifica un rol o permiso:

```typescript
await abacService.invalidateUserCache(userId, appId);
// borra el patrón: abac_granted:{userId}:{appId}:*
```

---

## Modos de autenticación

> **Requerimiento del cliente:** los usuarios finales se autentican **exclusivamente con Entra ID (Azure AD)**. No hay login por email/contraseña expuesto en el gateway.

El ecosistema soporta dos modos de autenticación para acceso externo + uno para servicios internos. Todos producen un `userId` que fluye por el mismo pipeline ABAC (`canAccess`).

```
OAuth client_id          Entra ID (oid Azure)     [M2M — servicios]
      │                         │                       │
validateAppCredentials   JWKS validate +          validateAppCredentials
      │                  syncEntraUser()                │
      │                         │                       │
  owner.id               syncedUser.id            owner.id
      │                         │                       │
      └─────────────────────────┴───────────────────────┘
                                │
                     request.user.sub = userId
                                │
                    AbacGuard.canAccess(userId, appId, resource, action, context)
                    Roles → Permisos → Políticas  ← mismo para todos
```

### CAPA 1 — OAuth 2.0 Client Credentials (apps externas)

Endpoint estándar RFC 6749 para aplicaciones externas que necesitan acceder a la API.

**Registrar un cliente OAuth** (admin):
```bash
POST /applications/oauth
Authorization: Bearer <admin-jwt>

{
  "name": "app-externa-reportes",
  "description": "App del equipo de BI",
  "ownerId": "<uuid-de-service-account>",
  "scopes": ["incidents:read", "requests:read"],
  "tokenDurationDays": 180
}
# Response: { client_id, client_secret (solo esta vez), scopes }
```

**Obtener token** (app externa):
```bash
POST /auth/oauth/token

{
  "grant_type": "client_credentials",
  "client_id": "ak_xxx",
  "client_secret": "sec_yyy",
  "scope": "incidents:read"         # opcional — subset de los scopes registrados
}
# Response RFC 6749: { access_token, token_type: "Bearer", expires_in: 3600, scope }
```

**Modelo de permisos:**
```
Application.owner (service account)
  └── Roles → Permissions  ← "techo" máximo de permisos posibles
Application.scopes          ← allow-list que filtra el token
  └── token.permissions = owner.permissions ∩ application.scopes
```

Los scopes son strings `resource:action` idénticos a los permisos ABAC. El token resultante fluye por `validateAbacToken()` en el gateway y luego por `AbacGuard.canAccess()` usando el `owner.id` como `userId`.

**Rotar client_secret:**
```bash
POST /applications/:id/rotate-secret
Authorization: Bearer <admin-jwt>
{ "updatedBy": "<admin-user-id>" }
# Response: { client_id, client_secret (nuevo, solo esta vez) }
```

**Distinción importante vs M2M interno:**

| | M2M interno (`POST /auth/m2m-token`) | OAuth externo (`POST /auth/oauth/token`) |
|---|---|---|
| Quién lo usa | Servicios internos (monolith, snowq) | Apps externas (BI, integraciones) |
| `Application.type` | `'internal'` | `'oauth_client'` |
| Scopes | No aplica | Filtrado por `application.scopes` |
| Endpoint en gateway | `@IsInternal()` — bypassa guards | Ruta normal — `AbacGuard` evalúa |
| Respuesta | `{ accessToken, ... }` | `{ access_token, ... }` (RFC 6749) |

---

### CAPA 2 — Entra ID (Azure AD)

La validación JWKS está centralizada en ABAC. El gateway delega completamente.

**Flujo:**
```
1. Usuario presenta Bearer token de Azure
2. JwtGuard: isEntraIdToken() = true (decode local, sin red)
3. abacClient.validateEntraToken(token)
   → POST /auth/validate-entra (x-api-key requerido)
       a. JWKS validate (firma Azure)
       b. syncEntraUser() — find/create User por entraId=oid
       c. Carga roles y permisos del usuario en ABAC
       d. Return { valid, oid, userId, permissions }
4. request.user = { sub: userId, permissions, tokenType: 'entra' }
5. AbacGuard.canAccess(userId, ...) — misma evaluación que cualquier usuario
```

**Variables de entorno** (en `apps/abac-microservice/.env.*`):
```env
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_JWKS_URI=https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys  # opcional
```

**Primer login de un usuario Entra ID:**
El usuario se crea automáticamente en ABAC (lazy sync) sin roles → `permissions: []`. Un admin debe asignarle roles:
```bash
POST /user-roles
Authorization: Bearer <admin-jwt>
{
  "userId": "<uuid-creado-por-sync>",
  "roleId": "<uuid-del-rol>",
  "applicationId": "<ABAC_APP_ID>"
}
```

---

## Operaciones de mantenimiento

### Seeds disponibles

| Comando | Qué hace |
|---|---|
| `npm run abac:seed` | Seed principal: aplicación, roles, permisos, políticas, 7 usuarios |
| `npm run abac:seed:m2m` | Cuentas de servicio M2M para 4 servicios internos |
| `npm run abac:seed:full` | `abac:seed` + `abac:seed:m2m` en el orden correcto |
| `npm run monolith:seed` | Datos de negocio del monolito (companies, corners, etc.) |

### Prerequisito: schema de base de datos

Los seeds usan `synchronize: false`. El schema lo crea TypeORM al arrancar el ABAC service:

```bash
npm run start:abac:dev   # arranca, crea/actualiza tablas, puede cerrarse con Ctrl+C
```

### Primera vez

```bash
npm run abac:seed:full   # paso 1 — seed ABAC completo (usuarios + M2M)
npm run monolith:seed    # paso 2 — datos de negocio
```

### Re-ejecutar el seed principal (destructivo)

```bash
# Interactivo (pregunta confirmación)
npm run abac:seed:full

# No interactivo (CI/CD) — pasar variables de entorno antes de correr
SEED_FORCE=true \
INIT_ADMIN_EMAIL=superadmin@eventcorner.com \
INIT_ADMIN_PASSWORD=<password> \
npm run abac:seed:full
```

El seed principal (`abac:seed`) limpia todos los datos de la aplicación "Event Corner" — incluyendo el rol `service-account` y las cuentas M2M. Por eso **siempre ejecutar `abac:seed:full`** en lugar de `abac:seed` a secas cuando se hace un re-seed.

Al finalizar genera `apps/abac-microservice/initial-credentials.json` con las credenciales de todos los usuarios y la `apiKey` de la aplicación.

### Después de un re-seed: actualizar variables de entorno

```env
# apps/api-gateway/.env.*  (y equivalente en cada servicio)
ABAC_APP_ID=<appId del initial-credentials.json>
ABAC_API_KEY=<apiKey del initial-credentials.json>
ABAC_M2M_TOKEN=<JWT obtenido con POST /auth/m2m-token — ver procedimiento abajo>
```

Las credenciales de cada servicio (apiKey + apiSecret) se muestran una vez en consola
al ejecutar `abac:seed:m2m`. Si se pierden, re-ejecutar para rotarlas.

### Rotación M2M

El modelo de autenticación M2M usa JWT de larga duración (configurable por servicio).
Las credenciales (`apiKey`/`apiSecret`) se usan **solo para obtener el JWT**; el JWT resultante
es lo que se guarda en `ABAC_M2M_TOKEN` de cada `.env`.

| Servicio | `tokenDurationDays` | Rotación aproximada |
|---|---|---|
| api-gateway | 180 | ~Septiembre / ~Marzo |
| monolith | 180 | ~Septiembre / ~Marzo |
| integration-service | 90 | Trimestral |
| api-snowq-service | 365 | Anual (~Marzo) |

> Escalonar las fechas reales para que no coincidan todas el mismo día.

#### Procedimiento de rotación (por servicio)

```bash
# 1. Si las credenciales del servicio se perdieron, regenerarlas (idempotente)
npm run abac:seed:m2m

# 2. Obtener un nuevo JWT M2M para el servicio objetivo
curl -s -X POST http://localhost:3005/auth/m2m-token \
  -H "x-api-key: <ABAC_API_KEY_del_servicio>" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"<apiKey>","apiSecret":"<apiSecret>"}' \
  | jq '.accessToken'

# 3. Copiar el accessToken al .env del servicio receptor
#    ABAC_M2M_TOKEN=<accessToken>

# 4. Reiniciar solo ese servicio
npm run pm2:dev   # o el comando específico del servicio

# 5. Verificar conectividad (ej. gateway → monolith)
curl -s http://localhost:3000/health
```

> Las credenciales M2M (`apiKey`/`apiSecret`) de cada servicio están en la salida de
> `npm run abac:seed:m2m` o en `apps/abac-microservice/initial-credentials.json`.

### Rotar solo credenciales M2M (sin re-seed completo)

```bash
npm run abac:seed:m2m
```

Este script es idempotente sobre los usuarios y permisos — solo rota las `apiKey`/`apiSecret`
de las 4 Applications de servicio. Puede ejecutarse en cualquier momento sin perder datos.

---

## Diagrama de prioridades

```
Evaluación de una request (resource:action)
───────────────────────────────────────────────────────────
[Cache]        HIT → retorna cached (skip todo)
               MISS ↓

[Paso 1]       ¿UserApplication activa?
               NO → DENY (cache false)

[Paso 2]       ¿Rol tiene permission resource:action con effect=allow?
               NO → DENY (cache false)
               effect=deny → DENY (cache false)

[Paso 3]       Políticas relevantes (ordenadas por priority DESC):

               priority 200  Employee deny delete    → condiciones? → DENY
               priority 180  Technician deny req:del → condiciones? → DENY
               priority 150  Manager deny críticos   → condiciones? → DENY
               ...
               priority 100  super-admin allow       → condiciones? → ALLOW
               priority 80   admin allow             → condiciones? → ALLOW
               priority 60   manager allow           → condiciones? → ALLOW
               priority 40   technician allow        → condiciones? → ALLOW
               priority 20   employee allow          → condiciones? → ALLOW
               priority 10   readonly allow          → condiciones? → ALLOW

               Ninguna matcheó → ALLOW (permiso base)
───────────────────────────────────────────────────────────
```

---


● Voy paso a paso usando el contexto real del proyecto:

  ---
  Paso 0 — Configuración

  Antes de que todo funcione, ABAC necesita saber con qué tenant de Azure está hablando. AZURE_TENANT_ID identifica tu directorio
  corporativo y AZURE_CLIENT_ID identifica la app registrada en Azure. Con esos dos datos ABAC construye la URL del JWKS endpoint de
  Microsoft donde están las claves públicas para verificar firmas.

  ---
  Paso 1 — El usuario se autentica en Azure

  El browser abre una ventana de Microsoft (login.microsoftonline.com), el usuario ingresa su usuario y contraseña corporativos, y
  Azure retorna un access_token. Ese token es un JWT firmado con la clave privada de Microsoft. Contiene el oid (object ID único del
  usuario en Azure), el email, el nombre, y tiene expiración corta (~1 hora).

  ---
  Paso 2 — El frontend llama al API Gateway

  El frontend pone ese token en el header Authorization: Bearer <token> y llama a cualquier endpoint del API Gateway, por ejemplo GET
   /incidents. El API Gateway recibe el request y lo intercepta el JwtGuard antes de que llegue al controlador.

  ---
  Paso 3 — El JwtGuard identifica el tipo de token

  El JwtGuard hace un jwt.decode() local, sin verificar la firma, solo para leer el campo iss del payload. Si el issuer contiene
  login.microsoftonline.com sabe que es un token de Entra ID. Si no, asume que es un JWT local de ABAC (para el super admin del
  dashboard). Con esa información decide qué camino tomar y llama internamente a POST /auth/validate-entra en ABAC pasando el token
  completo.

  ---
  Paso 4 — ABAC valida y sincroniza el usuario

  Este es el paso más importante. ABAC hace dos cosas:

  Primero valida la firma: lee el kid del header del token, va al JWKS endpoint de Microsoft a buscar la clave pública
  correspondiente, y verifica que la firma RS256 sea válida. Si el token fue manipulado o expiró, falla aquí.

  Luego hace el lazy sync: busca en su propia base de datos si ya existe un usuario con ese oid. Si no existe lo crea. Si existe
  actualiza lastLoginAt. Al final retorna el userId interno de ABAC más los permisos que tiene ese usuario asignados.

  ---
  Paso 5 — Asignar roles (solo la primera vez)

  Cuando el usuario se autentica por primera vez, ABAC lo crea pero sin ningún rol. Eso significa que canAccess() va a retornar false
   para cualquier recurso. Un administrador tiene que entrar al dashboard, buscar al usuario por email, y asignarle un rol (employee,
   technician, etc.). A partir de ese momento el usuario tiene permisos.

  ---
  Paso 6 — Evaluación de acceso

  Cada vez que el usuario intenta hacer algo en el sistema (crear una incidencia, ver un corner, etc.), el API Gateway llama a POST
  /abac/can-access con el userId interno, el recurso y la acción. ABAC evalúa si el usuario tiene el permiso asignado vía su rol y si
   las condiciones de las políticas se cumplen (horario, corner asignado, membresía vigente, etc.). Retorna { granted: true/false }.

  ---
  Paso 7 — Evaluación batch

  En lugar de hacer una llamada por cada botón de la pantalla, el frontend puede preguntar todo de una vez al cargar la vista. Manda
  un array de { resource, action } y ABAC responde todos juntos. Así el frontend sabe de entrada qué botones mostrar habilitados o
  deshabilitados.

  ---
  Testing local

  Como en desarrollo no hay Azure AD real, el endpoint POST /auth/dev/simulate-entra permite saltear los pasos 1, 2 y 3 (todo lo que
  involucra a Microsoft) y entrar directo al paso 4. Le mandás el oid y email manualmente y ABAC ejecuta el mismo sync que haría con
  un token real. Solo funciona con NODE_ENV=development.

---

● Browser / App corporativa
    │ 1. MSAL OAuth2 Authorization Code Flow
    │    GET https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize
    │    { client_id: AZURE_CLIENT_ID, scope: 'openid profile email', response_type: 'code' }
    ▼
  Microsoft Entra ID (Azure AD)
    │ 2. Usuario ingresa credenciales corporativas
    │ 3. Retorna access_token (JWT RS256)
    │    { iss: 'login.microsoftonline.com/<tenant>/v2.0',
    │      oid: 'azure-object-id',
    │      preferred_username: 'juan@empresa.com',
    │      name: 'Juan Pérez',
    │      exp: 1234567890 }
    ▼
  Browser / App corporativa
    │ Authorization: Bearer <entra_access_token>
    │ GET http://localhost:3000/incidents
    ▼
  api-gateway :3000  —  JwtGuard
    │ 4. jwt.decode(token) local — sin verificar firma
    │    ¿payload.iss.includes('login.microsoftonline.com')? → SÍ → flujo Entra ID
    │                                                         → NO → flujo JWT local ABAC
    │
    │ 5. POST http://localhost:3005/auth/validate-entra
    │    x-api-key: <ABAC_API_KEY>
    │    { token: '<entra_access_token>', applicationId: '<APP_ID>' }
    ▼
  abac-microservice :3005
    │ 6. EntraIdService.validate(token)
    │    a. jwt.decode(token) → lee kid del header
    │    b. GET https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys
    │       → obtiene clave pública RSA por kid (cacheada 10 min)
    │    c. jwt.verify(token, publicKey, { audience, issuer, algorithms: ['RS256'] })
    │       → token inválido / expirado → 401 UnauthorizedException
    │       → token válido → payload { oid, email, name }
    │
    │ 7. syncEntraUser(oid, email, name, applicationId)
    │
    │    ┌─ ¿usuario con entraId = oid?
    │    │     SÍ  → actualiza lastLoginAt
    │    │     NO  → ¿usuario con mismo email?
    │    │               SÍ + oid distinto → 409 Conflict (conflicto de tenants)
    │    │               SÍ + sin oid      → asocia oid al usuario existente
    │    │               NO                → CREATE usuario
    │    │                                    { accountType: 'user',
    │    │                                      passwordHash: null,
    │    │                                      email, firstName, lastName,
    │    │                                      entraId: oid }
    │    └─ carga roles y permisos del usuario en la aplicación
    │
    │ 8. logEvent(LOGIN, { userId, email, applicationId })
    │
    │ Response: { valid: true, oid, email,
    │             userId: '<uuid-interno>',
    │             permissions: ['incident:create', 'incident:read', ...] }
    ▼
  api-gateway :3000  —  JwtGuard (continuación)
    │ 9. request.user = {
    │      sub: userId, email, username,
    │      permissions: [...],
    │      tokenType: 'entra',
    │      oid
    │    }
    │ 10. Request continúa hacia el controlador
    ▼
  Controlador api-gateway :3000
    │ 11. AbacGuard → POST /abac/can-access
    │     { userId, applicationId, resource: 'incident', action: 'create', context: { cornerId, hour } }
    ▼
  abac-microservice :3005  —  canAccess()
    │ 12. validateUserApplication(userId, appId)
    │ 13. getUserPermissions(userId, appId, resource, action)
    │     → roles del usuario → role_permissions → permisos allow/deny
    │ 14. evaluatePolicies(policies, facts)
    │     facts = { user: { roles, email, attributes },
    │               application: { environment },
    │               membership: { type, isExpired },
    │               context: { cornerId, hour, ... } }
    │     → json-rules-engine evalúa condiciones
    │     → allow | deny | null
    │
    │ Response: { granted: true | false }
    ▼
  api-gateway :3000
    │ granted: false → 403 ForbiddenException
    │ granted: true  → proxy request
    ▼
  monolith :3001

  ══════════════════════════════════════════════════
    PRIMERA VEZ (usuario sin roles asignados)
  ══════════════════════════════════════════════════

    Paso 7 crea el usuario → sin roles → permissions: []
    Paso 14 → granted: false para cualquier recurso

    Admin debe asignar rol desde dashboard:
    POST /users/<USER_ID>/roles
    { roleId: '<role-employee>', applicationId: '<APP_ID>' }

    Próximo login → permissions: ['incident:create', 'incident:read', ...]

  ══════════════════════════════════════════════════
    DESARROLLO LOCAL (sin Azure AD)
  ══════════════════════════════════════════════════

    POST http://localhost:3005/auth/dev/simulate-entra   ← solo NODE_ENV=development
    { oid: 'test-oid', email: 'juan@empresa.com',
      name: 'Juan Pérez', applicationId: '<APP_ID>' }
    │
    └─ salta pasos 1-6, ejecuta directamente paso 7-8
       Response: { valid: true, userId, permissions }

---


● Supongamos que el usuario abre la pantalla de detalle de una incidencia. Esa pantalla tiene varios botones según el rol:

  Request — al cargar la pantalla:

  POST http://localhost:3005/abac/batch-evaluate
  x-api-key: <ABAC_API_KEY>

  {
    "requests": [
      { "userId": "uuid-juan", "applicationId": "uuid-app", "resource": "incident", "action": "read",          "context": { "hour":
  10 } },
      { "userId": "uuid-juan", "applicationId": "uuid-app", "resource": "incident", "action": "change-status", "context": { "hour":
  10 } },
      { "userId": "uuid-juan", "applicationId": "uuid-app", "resource": "incident", "action": "validate",      "context": { "hour":
  10 } },
      { "userId": "uuid-juan", "applicationId": "uuid-app", "resource": "incident", "action": "reopen",        "context": { "hour":
  10 } },
      { "userId": "uuid-juan", "applicationId": "uuid-app", "resource": "incident", "action": "delete",        "context": { "hour":
  10 } },
      { "userId": "uuid-juan", "applicationId": "uuid-app", "resource": "locker",   "action": "assign",        "context": { "hour":
  10 } }
    ]
  }

  Response — Juan es employee:

  [
    { "resource": "incident", "action": "read",          "granted": true  },
    { "resource": "incident", "action": "change-status", "granted": true  },
    { "resource": "incident", "action": "validate",      "granted": true  },
    { "resource": "incident", "action": "reopen",        "granted": false },
    { "resource": "incident", "action": "delete",        "granted": false },
    { "resource": "locker",   "action": "assign",        "granted": false }
  ]

  Cómo lo usa el frontend:

  const perms = Object.fromEntries(
      results.map(r => [`${r.resource}:${r.action}`, r.granted])
  )

  // perms = {
  //   'incident:read':          true,
  //   'incident:change-status': true,
  //   'incident:validate':      true,
  //   'incident:reopen':        false,
  //   'incident:delete':        false,
  //   'locker:assign':          false,
  // }

  <Button disabled={!perms['incident:change-status']}>Cambiar estado</Button>
  <Button disabled={!perms['incident:validate']}>Validar cierre</Button>
  <Button disabled={!perms['incident:reopen']}>Reabrir</Button>       {/* deshabilitado */}
  <Button disabled={!perms['incident:delete']}>Eliminar</Button>       {/* deshabilitado */}
  <Button disabled={!perms['locker:assign']}>Asignar locker</Button>   {/* deshabilitado */}

  La misma pantalla para un technician o admin retornaría más granted: true y vería más botones habilitados — sin cambiar nada en el
  frontend.
