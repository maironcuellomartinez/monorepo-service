# Event Corner v3 — Progreso del desarrollo

> Última actualización: 2026-04-19

---

## ✅ COMPLETADO

### 1. Monorepo NestJS — estructura y compilación
- Configuración `tsconfig.json` raíz con path aliases `@app/core/*` y `@app/shared/*`
- `nest-cli.json` con `tsConfigPath` por proyecto (`api-gateway`, `monolith`, `abac-microservice`)
- `apps/abac-microservice/tsconfig.app.json` extendiendo el raíz (fix de 68 errores de compilación)
- `tsBuildInfoFile` dentro del `outDir` del ABAC (fix del error `Cannot find module 'dist/apps/abac-microservice/main'` en watch mode)
- Comandos operativos:
  - `npm run start:api-gateway:dev`  → :3000
  - `npm run start:monolith:dev`     → :3001
  - `npm run start:abac:dev`         → :3005

---

### 2. ABAC Microservice — seed de datos iniciales
**Archivo:** `apps/abac-microservice/src/scripts/seed-initial-data.ts`

- Crea aplicación "Event Corner" con API key (`ec_<40hex>`) para el API Gateway
- **13 recursos** con sus acciones (71 permisos totales):
  - `incident`: create, read, list, take, release, change-status, validate, reopen
  - `corner`: create, read, list, update, delete
  - `schedule`: create, list, assign-technicians
  - `slot`: read, list
  - `locker`: read, list, assign, release
  - `request`: create, read, list, change-status
  - `issue-type`: create, read, list, update, delete
  - `company`: create, read, list, update
  - `technician`: create, read, list, update
  - `user`: create, read, list, update, deactivate
  - `device`: read, list, register
  - `availability`: read, read-technicians
  - `report`: read
- **5 roles** (principio de menor privilegio):
  - `super-admin` → todos los permisos
  - `admin` → gestión sin acciones críticas de usuario
  - `manager` → lectura + gestión de incidencias
  - `technician` → incidencias + disponibilidad
  - `employee` → solo crear incidencias + leer
- **5 políticas** (json-rules-engine): una por rol con condición `user.roles contains <roleName>`
- **3 usuarios iniciales**: super-admin (interactivo), admin@eventcorner.com, manager@eventcorner.com
- Guarda `initial-credentials.json` con IDs, keys y contraseñas generadas

**Fix aplicado:** backtick-escape de palabras reservadas MariaDB (`` `condition` ``, `` `operator` ``)
**Fix aplicado:** `-r tsconfig-paths/register` en scripts de seed + path alias `src/*` en tsconfig local

**Scripts:**
```bash
cd apps/abac-microservice
npm run seed:init        # seed completo
npm run seed:admin       # solo usuarios admin
```

---

### 3. API Gateway — autenticación y autorización
**Directorio:** `apps/api-gateway/src/auth/`

#### Guards globales (orden de ejecución)
1. `JwtGuard` → valida Bearer token con `JwtService.verifyAsync`, popula `request.user`
2. `RolesGuard` → llama `GET /abac/user-roles?userId=&applicationId=`, verifica rol requerido
3. `AbacGuard` → llama `POST /abac/can-access`, verifica permiso específico

#### Decoradores
- `@Public()` → omite los tres guards
- `@Permission(resource, action)` → requiere permiso ABAC
- `@Roles('super-admin', 'admin')` → requiere al menos uno de los roles
- `@CurrentUser()` → param decorator que inyecta el `JwtPayload`

#### AbacClient
- `canAccess(userId, resource, action, context?)` → `POST /abac/can-access`
- `getUserRoles(userId)` → `GET /abac/user-roles`
- Fail-closed: si ABAC está caído, deniega acceso

#### Endpoint nuevo en ABAC
`GET /abac/user-roles?userId=&applicationId=` → `{ roles: string[] }` (protegido por `ApiKeyGuard`)

#### Variables de entorno necesarias (API Gateway)
```env
JWT_SECRET=<mismo secret del ABAC>
JWT_ISSUER=abac-service
JWT_AUDIENCE=abac-clients
ABAC_URL=http://localhost:3005
ABAC_API_KEY=<api key del seed>
ABAC_APP_ID=<application id del seed>
```

---

### 4. API Gateway — controllers decorados con @Permission
| Controller | Permisos asignados |
|---|---|
| `IncidentsController` | `incident:{list, read, create, take, release, change-status, validate, reopen}` |
| `CornersController` | `corner:{list, read, create, update, delete}`, `schedule:{create, list, assign-technicians}` |
| `AvailabilityController` | `availability:{read, read-technicians}` |
| `IssueTypesController` | `issue-type:{list, read, create, update, delete}` |
| `RequestsController` | `request:{list, read, create, change-status}` |

---

### 5. Máquina de estados de incidencias — rediseño completo
**Archivos modificados:**
- `apps/monolith/src/core/domain/enums/incident-status.enum.ts`
- `apps/monolith/src/core/domain/constants/incident.constants.ts`
- `apps/monolith/src/core/domain/enums/timeline-action.enum.ts`
- `apps/monolith/src/core/services/availability/availability.service.ts`
- `apps/monolith/src/core/domain/entities/incident.entity.ts`

#### Estados nuevos (alineados con `docs/state.jpg`)
```
CREATED               → Cita creada (dispositivo aún no entregado)
DELIVERED             → Dispositivo entregado en la cita          [NUEVO]
IN_PROGRESS           → Técnico trabajando en la resolución
PENDING_THIRD_PARTY   → Pendiente de acción de tercero            [NUEVO, reemplaza PAUSED]
PENDING_USER          → Pendiente de acción del usuario           [NUEVO, reemplaza WAITING_FOR_RESPONSE]
PENDING_SPARE_PART    → Pendiente de llegada de repuesto          [NUEVO]
PENDING_PICKUP        → Dispositivo reparado listo para recoger   [NUEVO]
PENDING_REPLACEMENT_DELIVERY → Sustitución lista para recoger     [NUEVO]
CLOSED                → Cita cerrada (cliente recogió)
REOPENED              → Reabierta por técnico
VALIDATED             → Validada por cliente (post-cierre)
CANCELED              → Cancelada por cliente
```

#### Transiciones válidas
```
CREATED   → DELIVERED, CANCELED
DELIVERED → IN_PROGRESS, PENDING_THIRD_PARTY, PENDING_USER, PENDING_SPARE_PART
IN_PROGRESS → PENDING_THIRD_PARTY, PENDING_USER, PENDING_SPARE_PART,
              PENDING_PICKUP, PENDING_REPLACEMENT_DELIVERY
PENDING_THIRD_PARTY / PENDING_USER / PENDING_SPARE_PART → IN_PROGRESS
PENDING_PICKUP / PENDING_REPLACEMENT_DELIVERY → CLOSED
CLOSED → (via reopen()) REOPENED, (via validate()) VALIDATED
REOPENED → IN_PROGRESS
```

#### Nota de migración DB
La columna `status` en la tabla `incidents` necesita actualizar el ENUM:
- Añadir: `DELIVERED`, `PENDING_THIRD_PARTY`, `PENDING_USER`, `PENDING_SPARE_PART`, `PENDING_PICKUP`, `PENDING_REPLACEMENT_DELIVERY`
- Eliminar (o migrar datos): `PAUSED` → `PENDING_THIRD_PARTY`, `WAITING_FOR_RESPONSE` → `PENDING_USER`

---

## 🔲 PENDIENTE

### Alta prioridad

~~#### P1 — Migración de base de datos~~ ✅
~~#### P2 — Incident service — método `deliver()`~~ ✅
~~#### P3 — Incident service — actualizar `changeStatus`~~ ✅
~~#### P4 — Tests unitarios — actualizar specs~~ ✅ (82 tests en verde)

~~#### P5 — Controllers con @Roles para endpoints admin~~ ✅
~~Actualmente todos los endpoints solo tienen `@Permission`. Agregar `@Roles` donde corresponde:~~
- ~~`IssueTypesController`: create/update/delete → `@Roles('admin', 'super-admin')`~~
- ~~`CornersController`: create/update/delete → `@Roles('admin', 'super-admin')`~~
- ~~Endpoints de técnico (take, release, change-status) → `@Roles('technician', 'admin', 'super-admin')`~~
- ~~Endpoints de cliente (create incident, validate) → `@Roles('employee', ...)`~~

~~#### P6 — Outbound controllers — protección con @Public o guards específicos~~ ✅
**Implementado con `@InternalOnly()` + header `x-internal-token`:**
- `apps/api-gateway/src/auth/decorators/internal.decorator.ts` — nuevo decorador
- `JwtGuard` modificado: detecta `@InternalOnly()` y valida `x-internal-token` vs `INTERNAL_API_TOKEN` (env)
- `servicenow-outbound.controller.ts` y `inventory-outbound.controller.ts` decorados con `@InternalOnly()`
- `ServiceNowProxyAdapter` e `InventoryHttpAdapter` en el monolito envían `x-internal-token` en cada request
- Variable de entorno requerida en ambas apps: `INTERNAL_API_TOKEN=<secreto-compartido>`

~~#### P7 — API Gateway — endpoint de autenticación proxy~~ ✅
**Implementado en `apps/api-gateway/src/inbound/auth/`:**
- `AuthController` con 3 endpoints públicos (`@Public()`):
  - `POST /api/auth/login` → body `{ email, password }` → devuelve `{ accessToken, refreshToken, ... }`
  - `POST /api/auth/refresh` → body `{ refreshToken }` → devuelve `{ accessToken, refreshToken, ... }`
  - `POST /api/auth/logout` → body `{ refreshToken }` → 204 No Content
- `AbacClient` extendido con `login()`, `refresh()`, `logout()` — inyecta `x-api-key` en login
- Registrado en `ApiGatewayModule`

~~#### P8 — Variables de entorno — `.env.example` para cada app~~ ✅
- `apps/api-gateway/.env.example` — 12 variables (puerto, JWT, ABAC, monolith, internal token, outbound)
- `apps/monolith/.env.example` — 8 variables (puerto, DB, api-gateway URL, internal token)
- `apps/abac-microservice/.env.example` — 13 variables (puerto, DB, JWT, Redis, sesiones, CORS)
- **Nota:** `INTERNAL_API_TOKEN` y `JWT_SECRET` deben ser iguales en las apps que los comparten

### Baja prioridad

~~#### P9 — Caché de roles en RolesGuard~~ ✅
- `Map<userId, { roles, expiresAt }>` en memoria, TTL = 60 s
- También salta la verificación en rutas `@InternalOnly()` (no tienen JWT/user)
- Miss → llama ABAC y puebla caché; Hit → retorna directo sin HTTP

~~#### P10 — Seed del ABAC — agregar permisos faltantes~~ ✅
**5 permisos añadidos a `ALL_PERMISSIONS` + `ROLE_PERMISSIONS`:**
| Permiso | Roles que lo reciben |
|---|---|
| `incident:deliver` | technician, manager, admin, super-admin |
| `schedule:list` | employee, technician, manager, admin, super-admin |
| `schedule:assign-technicians` | admin, super-admin |
| `availability:read-technicians` | technician, manager, admin, super-admin |
| `request:change-status` | technician, manager, admin, super-admin |

**Bonus:** `employee` recibe `incident:validate` (faltaba para el flujo `@Roles('employee',...)`).
**Nota:** `request:update-status` se mantiene como legacy; `request:change-status` es el canónico.
**Usuarios `technician`/`employee`:** se crean desde la app (no desde seed) — decisión confirmada.

~~#### P11 — Documentación de API (Swagger)~~ ✅
- SwaggerModule configurado en `api-gateway/main.ts` → disponible en `GET /docs`
- `@ApiTags` + `@ApiBearerAuth('jwt')` en los 6 controllers
- `@ApiOperation` + `@ApiParam` + `@ApiQuery` en todos los endpoints
- BearerAuth configurado con `addBearerAuth()` en `DocumentBuilder`

~~#### P12 — Tests de integración E2E~~ 🔲 (pendiente — ver sección abajo)

---

### 6. Modelo ER y entidades TypeORM — correcciones (2026-03-12)
**Archivos modificados:**
- `docs/er-diagram.md`
- Todas las entidades TypeORM relevantes

#### Cambios aplicados
- Renombrado de columnas LDAP a nombres neutros en `UserEntity`:
  - `ldap_id` → `external_id`, `ldap_domain` → `domain`, `ldap_principal_name` → `principal_name`
- Relación bidireccional faltante: `UserEntity @OneToMany → IncidentEntity`
- Tres `@OneToMany` inversos faltantes añadidos:
  - `TechnicianEntity` → `requests: RequestEntity[]`
  - `CompanyEntity` → `requests: RequestEntity[]`
  - `RequestEntity` → `activities: RequestActivityEntity[]`
- Corregido nombre de tabla en Mermaid: `request_timeline` → `request_activities`
- Añadidas columnas `domain` y `principal_name` a tabla `users` en Mermaid
- Diagrama arquitectura hexagonal actualizado para reflejar el Outbox

#### Migración DB requerida
```sql
-- Renombrar columnas en tabla users
ALTER TABLE users RENAME COLUMN ldap_id TO external_id;
ALTER TABLE users RENAME COLUMN ldap_domain TO domain;
ALTER TABLE users RENAME COLUMN ldap_principal_name TO principal_name;
```

---

### 7. DomainEvent — unificación (2026-03-12)
**Fuente única:** `libs/shared/src/domain-event.ts`

Antes existían dos definiciones incompatibles:
- Clase abstracta en `@app/shared` (sin `type`, con `occurredAt`)
- Interfaz en `event-bus.port.ts` (sin `eventId`, sin `aggregateType`)

**Resultado:** una sola clase concreta `DomainEvent` con:
```
eventId        → UUID (idempotency key para el outbox)
type           → nombre del evento
aggregateId    → ID del agregado
aggregateType  → nombre del agregado ('Incident', 'Request', etc.)
data           → payload específico
timestamp      → cuándo ocurrió
version        → versionado de eventos
correlationId / causationId / triggeredBy
```

**Archivos migrados a `new DomainEvent(...)`:**
- `incident.entity.ts` — 11 eventos, replay methods actualizados
- `request.entity.ts`
- `issue-type.service.ts` (3 eventos)
- `corner.service.ts` (1 evento)
- `technician.service.ts` (1 evento)

---

### 8. Patrón Outbox — implementación (2026-03-12)
**Archivos nuevos:**
- `infrastructure/persistence/typeorm/entities/outbox-event.entity.ts`
- `infrastructure/event-bus/outbox-event-bus.adapter.ts`
- `infrastructure/event-bus/outbox-worker.service.ts`

**Flujo:**
```
Service.publishMany(events)
  └─► OutboxEventBusAdapter → INSERT outbox_events (published_at = NULL)

@Interval(5s) OutboxWorkerService
  ├─► SELECT WHERE published_at IS NULL ORDER BY created_at LIMIT 50
  ├─► InMemoryEventBus.publish(event)  ← activa handlers registrados
  └─► UPDATE SET published_at = NOW()
```

**Tokens DI:**
- `EVENT_BUS` → `OutboxEventBusAdapter` (lo que usan los servicios)
- `IN_MEMORY_EVENT_BUS` → `InMemoryEventBusAdapter` (lo que usa el worker para dispatch)

**Migración DB requerida:**
```sql
CREATE TABLE outbox_events (
    event_id     VARCHAR(36)  PRIMARY KEY,
    event_type   VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(50)  NOT NULL,
    payload      JSON         NOT NULL,
    published_at TIMESTAMP    NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_outbox_pending (published_at, created_at)
);
```

---

---

### 9. Event handlers ServiceNow (P13 — completado 2026-03-12)
**Archivos creados:**
```
infrastructure/event-handlers/
  incident-servicenow.handler.ts   ← subscribe('INCIDENT_CREATED', ...)
  request-servicenow.handler.ts    ← subscribe('REQUEST_CREATED', ...)
  event-handlers.module.ts         ← módulo no-global importado en MonolithModule
```

**Flujo:**
1. `OutboxWorkerService` despacha el evento via `IN_MEMORY_EVENT_BUS`
2. Handler recibe `INCIDENT_CREATED` → carga incident → resuelve company (via user.companyId) → llama `ServiceNowIntegrationService.createIncidentTicket`
3. Handler persiste `servicenow_id` / `servicenow_number` via `incidentRepo.update()`
4. Idempotencia: si `incident.servicenowId` ya existe, se saltea la llamada

**Cambios en módulos:**
- `InfrastructureModule`: añadido `IN_MEMORY_EVENT_BUS` a `exports`
- `MonolithModule`: importa `EventHandlersModule` después de `CoreServicesModule`

---

### 10. Migración SQL inicial (P14 — completado 2026-03-12)
**Archivo:** `docs/migrations/001_initial_schema_updates.sql`
- `ALTER TABLE users` — renombra `ldap_id → external_id`, añade `domain`, `principal_name`
- `CREATE TABLE outbox_events` — con `idx_outbox_pending (published_at, created_at)`
- `ALTER TABLE incidents MODIFY status ENUM(...)` — 12 estados según `IncidentStatus` enum

---

### 11. `@app/observability` — librería compartida (2026-03-15)

#### Motivación
El módulo de observabilidad original vivía únicamente en `apps/abac-microservice/src/observability/`.
Se migró a `libs/observability/` para que los tres servicios lo consuman sin duplicar código.

#### Estructura creada
```
libs/observability/src/
  services/
    correlation-id.service.ts       ← AsyncLocalStorage per-request context
    logger.service.ts               ← Winston + correlationId en cada línea
    metrics-producer.service.ts     ← OTel Meter wrapper
    monitoring.service.ts           ← trackOperation<T>(name, fn) + timing
    health-metrics.service.ts       ← dependency health como OTel metrics
    telemetry/tracing.service.ts    ← OTel span management
  middleware/correlation.middleware.ts   ← lee x-correlation-id o genera UUID
  filters/all-exceptions.filter.ts      ← Axios status propagation + sanitización prod
  interceptors/
    correlation.interceptor.ts     ← correlation context por request
    performance.interceptor.ts     ← controller_execution_duration_ms + slow_requests_total
  decorators/tracking.decorator.ts ← @TrackPerformance, @BusinessMetric, @LogExecution
  transports/winston-rabbitmq.transport.ts ← batch transport (50 msgs / 2 s)
  observability.module.ts          ← @Global, forRoot({ serviceName })
  index.ts                         ← barrel exports
```

#### Integración por app
| App | Cambio |
|---|---|
| `api-gateway` | `ObservabilityModule.forRoot({ serviceName: 'api-gateway' })` + `CorrelationMiddleware` |
| `monolith` | `ObservabilityModule.forRoot({ serviceName: 'monolith' })` + `CorrelationMiddleware` |
| `abac-microservice` | `ObservabilityModule.forRoot({ serviceName: 'abac-microservice' })` + `CorrelationMiddleware` |

#### Compilación — fix webpack
Todos los `tsconfig.app.json` incluyen `"paths"` explícitos con `../../libs/observability/src/index.ts`.
Se habilitó `"webpack": true` en `nest-cli.json` para los tres apps. Esto resuelve:
- El path doble `dist/apps/api-gateway/apps/api-gateway/src/main.js` que producía `tsc` bare
- El error de runtime `Cannot find module '../../../libs/observability/src/index.ts'`

Webpack instala como devDependency: `webpack`, `webpack-node-externals`.

#### DI fixes en abac-microservice
Todos los servicios que inyectaban `LoggerService`, `CorrelationIdService`, `MetricsProducerService`,
`TracingService` desde los wrappers locales `_v2` fueron actualizados a `import from '@app/observability'`
para que el token DI coincida con lo que provee `ObservabilityModule.forRoot()`.

Archivos actualizados: `abac.service`, `audit.service`, `application.service`, `auth.service`,
`Session.service`, `permission.service`, `policy.service`, `role.service`, `user.service`,
`user-role.service`, `abac-metrics.service`, `abac.module`, `policy.module`, y controllers de decoradores.

#### Limpieza — archivos eliminados
- `apps/api-gateway/src/inbound/common/filters/http-exception.filter.ts`
- `apps/abac-microservice/src/observability/services/` — `*_v2.service.ts` (×4), `health-metrics`, `index`
- `apps/abac-microservice/src/observability/filters/all-exceptions_v2.filter.ts`
- `apps/abac-microservice/src/observability/interceptors/` — `correlation.interceptor.ts` (local), `performance_v2.interceptor.ts`
- `apps/abac-microservice/src/observability/middleware/correlation_v2.middleware.ts`
- `apps/abac-microservice/src/observability/transports/winston_v2-transport.ts`
- `apps/abac-microservice/src/observability/` — `logger.service.ts`, `correlation-id.service.ts`, `decorators/tracking.decorator.ts`

**Quedan** en `apps/abac-microservice/src/observability/`: `index.ts`, `observability.module.ts`,
`interfaces/`, `services/metrics/` (Prometheus), `services/telemetry/` (OTel SDK bootstrap).

---

### 12. Fixes de runtime en monolith (2026-03-15)

| Error | Causa | Fix |
|---|---|---|
| `UnknownDependenciesException: HttpService` | `HttpModule` no importado en `MonolithModule` | Añadido `HttpModule` de `@nestjs/axios` |
| `UnknownDependenciesException: ConfigService` | `ConfigModule` no importado en `MonolithModule` | Añadido `ConfigModule.forRoot({ isGlobal: true })` |
| `EntityMetadataNotFoundError: OutboxEventEntity` | Glob `entities: [__dirname + '/**/*.entity{.ts,.js}']` no funciona con webpack (no hay archivos .js separados en disco) | Reemplazado por lista explícita de 18 clases entidad |
| `DataTypeNotSupportedError: "Object" in day_of_week` | TypeScript enum refleja como `Object` en `emitDecoratorMetadata` con webpack | Añadido `type: 'varchar'` explícito en `@Column()` de `CornerScheduleEntity.day_of_week` |

---

---

### 13. OAuth 2.0 Client Credentials + Centralizar Entra ID en ABAC (2026-03-27)

#### Motivación
- **CAPA 1**: Exponer un endpoint OAuth 2.0 estándar (`client_credentials`) para apps externas sin database propia.
- **CAPA 2**: Centralizar la validación JWKS de Entra ID (Azure AD) en `abac-microservice` — antes vivía fragmentada entre gateway y ABAC.

Principio: `apiKey` = `client_id`, `apiSecret` = `client_secret`. Extender, no duplicar.

---

#### Fase 0 — Extender `Application` entity

**Archivo:** `apps/abac-microservice/src/entities/application.entity.ts`

4 columnas nuevas (todas nullable/con default → sin migración manual):

| Campo | Tipo | Default | Propósito |
|---|---|---|---|
| `type` | varchar(20) | `'internal'` | Discriminador: `'internal'` \| `'oauth_client'` \| `'entra_app'` |
| `scopes` | json, nullable | null | Allow-list de scopes: `['incidents:read']` |
| `entraObjectId` | varchar(100), nullable, unique | null | oid de Azure AD |
| `entraTenantId` | varchar(100), nullable | null | Tenant ID de Azure |

Todas las apps existentes mantienen `type='internal'` — cero cambio de comportamiento.

---

#### Fase 1 — OAuth 2.0 Client Credentials (CAPA 1)

**Paso 1.1 — Refactorizar `AuthService`:**
- Extraída `validateApplicationCredentials(apiKey, apiSecret)` como método privado compartido
- `generateM2MToken()` refactorizado como wrapper delgado — interfaz idéntica, cero cambio de comportamiento

**Paso 1.2 — DTOs** (`apps/abac-microservice/src/abac/dtos/CheckEmailDto.ts`):
```typescript
OAuthTokenDto       { grant_type, client_id, client_secret, scope? }
ValidateEntraTokenDto { token, applicationId? }
```

**Paso 1.3 — `generateOAuthToken()`** en AuthService:
1. Llama `validateApplicationCredentials()`
2. Verifica `application.type === 'oauth_client'`
3. Intersecta `requestedScope.split(' ')` con `application.scopes` (allow-list)
4. Filtra permisos del owner a solo los que matchean los scopes concedidos
5. Firma JWT `{ sub: userId, type:'service', permissions, scope, applicationId }`
6. Retorna formato RFC 6749: `{ access_token, token_type:'Bearer', expires_in:3600, scope }`

**Paso 1.4 — Endpoint** `POST /auth/oauth/token` (público):
- Valida `grant_type === 'client_credentials'`, sino → `{ error: 'unsupported_grant_type' }`
- Errores RFC 6749: `invalid_client`, `invalid_scope`

**Paso 1.5 — Admin endpoints** en `ApplicationController`:
- `POST /applications/oauth` → `createOAuthClient()` — crea app con `type='oauth_client'`, retorna `client_secret` en texto plano (única vez)
- `POST /applications/:id/rotate-secret` → `rotateClientSecret()` — rota el secret, retorna nuevo en texto plano

> Nota: `POST /applications/oauth` declarado ANTES de rutas con `:id` para evitar conflicto de routing.

---

#### Fase 2 — Centralizar Entra ID en ABAC (CAPA 2)

**Paso 2.1 — `EntraIdService`** nuevo en abac-microservice:

**Archivo:** `apps/abac-microservice/src/abac/services/entra-id.service.ts` (nuevo)

- JWKS client con cache 10 min, rate limit (jwks-rsa)
- `validate(token)` → valida firma + claims → `{ oid, email, name, groups }`
- Config: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`

**Paso 2.2 — `validateEntraToken()`** en AuthService:
1. `entraIdService.validate(token)` → validación JWKS
2. `syncEntraUser(oid, email, name, applicationId)` → lazy sync existente
3. Retorna `{ valid, oid, email, userId, permissions }`

**Paso 2.3 — Endpoint** `POST /auth/validate-entra` (ApiKeyGuard):
- Solo servicios de confianza (gateway) pueden llamarlo

**Paso 2.4 — Módulo:** `EntraIdService` añadido a providers de `AbacModule`.

**Paso 2.5 — Simplificar gateway:**

`apps/api-gateway/src/auth/abac.client.ts`: nuevo método `validateEntraToken(token)` → `POST /auth/validate-entra`

`apps/api-gateway/src/auth/guards/jwt.guard.ts`: `validateEntraIdToken()` simplificado:
- ANTES: 2 llamadas a red (`entraIdService.validate` + `abacClient.syncEntraUser`)
- DESPUÉS: 1 llamada a red (`abacClient.validateEntraToken`) — ABAC hace ambas cosas

`apps/api-gateway/src/auth/entra-id.service.ts`: `validate()` y toda la lógica JWKS eliminada.
Solo mantiene `isEntraIdToken()` (3 líneas, `jwt.decode` local, sin red).

---

#### Requerimiento del cliente: solo Entra ID para usuarios

Los usuarios finales deben autenticarse exclusivamente con Entra ID (Azure AD/Microsoft SSO).
No hay login por email/contraseña expuesto en el gateway.

**Cambio de código asociado:**
- `apps/api-gateway/src/inbound/auth/auth.controller.ts` — endpoints `login`, `refresh`, `logout` eliminados del gateway. La clase `AuthController` queda vacía con un comentario explicativo.
- El `AbacClient` sigue teniendo `login()`, `refresh()`, `logout()` para scripts de administración y seeds, pero no están expuestos públicamente.

#### Flujo unificado de userId

Todos los modos de autenticación producen un `userId` que fluye por el mismo pipeline ABAC sin modificación:

```
M2M token       → AuthService.generateM2MToken()            → userId del owner del service account
OAuth token     → AuthService.generateOAuthToken()          → userId del owner de la app
Entra ID        → AuthService.validateEntraToken() + sync   → userId ABAC del usuario SSO
                                                               ↓
                                              AbacGuard.canAccess(userId, resource, action)
```

---

#### Archivos modificados

| Archivo | Acción |
|---|---|
| `abac/entities/application.entity.ts` | +4 columnas (type, scopes, entraObjectId, entraTenantId) |
| `abac/services/auth.service.ts` | Extraer helper + 2 métodos nuevos (generateOAuthToken, validateEntraToken) |
| `abac/dtos/CheckEmailDto.ts` | +2 DTOs (OAuthTokenDto, ValidateEntraTokenDto) |
| `abac/controllers/auth.controller.ts` | +2 endpoints (/auth/oauth/token, /auth/validate-entra) |
| `abac/services/application.service.ts` | +2 métodos (createOAuthClient, rotateClientSecret) |
| `abac/controllers/application.controller.ts` | +2 endpoints (/applications/oauth, /applications/:id/rotate-secret) |
| `abac/services/entra-id.service.ts` | **Nuevo** — JWKS validation + lazy sync |
| `abac/abac.module.ts` | +EntraIdService en providers |
| `gateway/auth/abac.client.ts` | +validateEntraToken() |
| `gateway/auth/guards/jwt.guard.ts` | Simplificar validateEntraIdToken() (2 calls → 1) |
| `gateway/auth/entra-id.service.ts` | Eliminar validate(), mantener solo isEntraIdToken() |
| `docs/abac-guide.md` | +Sección "Modos de autenticación" |
| `docs/api-curl-guide.md` | +Sección 0 "Autenticación" (5 subsecciones) |
| `docs/architecture-diagrams.md` | Diagramas actualizados + nuevos flujos auth |
| `docs/plan-oauth-entra-capas.md` | Plan de implementación archivado |

---

---

### 14. Batch Drafts — Creación masiva de incidencias (2026-04-19)

#### Fase 1 — Validaciones en booking de slots ✅
- `CornerSlot.isAvailableForUser(userId?)` — HELD por el mismo usuario pasa validación
- `IncidentService.createIncident({ heldByUserId })` — transición HELD→BOOKED atómica
- `ISlotRepository.holdManyAtomic(slotIds, userId, ttlMinutes)` — UPDATE condicional (race-condition safe)
- `ISlotRepository.releaseHoldsAtomic(slotIds, userId)` — libera solo los holds del usuario
- Tests unitarios actualizados: `incident.service.spec.ts`, `availability.service.spec.ts`

#### Fase 2 — Estado HELD en slots ✅
- Columnas `held_by_user_id` (varchar) y `held_until` (timestamp) en `corner_slots`
- `CornerSlotEntity` — fix TypeORM: `type: 'varchar'` explícito (evita "Object" type error)
- Índice `idx_corner_starts_status_held` para queries de disponibilidad
- `AvailabilityService` — slots HELD expirados se tratan como AVAILABLE

#### Fase 3 — Batch Draft service + API ✅
- Tablas `incident_batch_drafts` + `incident_batch_draft_items`
- `BatchDraftService` — addItem, editItem, removeItem, submit, discard, renewHolds
- Idempotencia por `localId` (UUID client-side)
- `BatchDraftItemEntity` — fix TypeORM: shadow FK `draft_id` sin `@Column` duplicado
- `BatchDraftsController` en api-gateway — proxea al monolito con `userId: user.sub`
- Frontend: `useBatchDraft` hook (API-first, renovación automática cada 5 min), `batch-incident-page.tsx`
- Ver detalle en `docs/batch-drafts.md`

---

## 🔲 PENDIENTE

### Baja prioridad

#### P12 — Tests de integración E2E
- Flujo completo: login → create incident → deliver → in_progress → pending_pickup → closed → validate
- Pruebas de autorización: verificar que cada rol solo accede a lo que le corresponde

#### P15 — Limpieza de `outbox_events`
Actualmente los eventos con `published_at IS NOT NULL` se acumulan indefinidamente.
Implementar un job de limpieza: `DELETE FROM outbox_events WHERE published_at < NOW() - INTERVAL 30 DAY`.

#### P16 — Idempotencia en event handlers SN
Si el `OutboxWorkerService` despacha dos veces el mismo evento (crash entre publish y update),
el handler SN puede crear dos tickets. Solución: verificar `incident.servicenowId IS NULL` antes de llamar a SN.

---

## 📂 Archivos clave

```
apps/
  api-gateway/src/
    auth/
      abac.client.ts              ← HTTP client → ABAC (canAccess + getUserRoles)
      auth.module.ts              ← registra JwtGuard, RolesGuard, AbacGuard como APP_GUARD
      guards/
        jwt.guard.ts
        roles.guard.ts
        abac.guard.ts
      decorators/
        public.decorator.ts       ← @Public()
        permission.decorator.ts   ← @Permission(resource, action)
        roles.decorator.ts        ← @Roles(...roles)
        current-user.decorator.ts ← @CurrentUser() + JwtPayload interface
    inbound/
      incidents/incidents.controller.ts     ← @Permission en cada endpoint
      corners/corners.controller.ts
      availability/availability.controller.ts
      admin/issue-types.controller.ts
      requests/requests.controller.ts

  abac-microservice/src/
    abac/controllers/abac.controller.ts     ← GET /abac/user-roles [NUEVO]
    scripts/seed-initial-data.ts            ← seed completo del dominio

  monolith/src/core/domain/
    enums/incident-status.enum.ts           ← 11 estados + transiciones
    enums/timeline-action.enum.ts           ← acciones del timeline sincronizadas
    constants/incident.constants.ts         ← VALID_STATUS_TRANSITIONS actualizado
    entities/incident.entity.ts             ← replayTaken corregido

docs/
  state.jpg          ← diagrama de estados de incidencias (fuente de verdad)
  progress.md        ← este archivo
```
