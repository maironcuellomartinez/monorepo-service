# Plan: Integración completa del ecosistema Event Corner

## Contexto

Cinco ejes de trabajo para llevar el ecosistema a producción:
1. Conectar integration-service al gateway (Opción A)
2. M2M en ABAC (service accounts, API keys centralizadas)
3. Autenticación de usuarios via Microsoft Entra ID
4. Migrar ABAC de auth de usuarios a motor de autorización puro
5. Reemplazar `x-internal-token` por JWT M2M

## Estado de implementación

| Fase | Estado | Completado |
|------|--------|------------|
| Fase 1 — Conectar integration-service | ✅ Completa | integration-service en :3008, InternalTokenGuard, 13 endpoints proxy en gateway (`/outbound/integration/*`), en PM2 |
| Fase 2 — M2M en ABAC | ✅ Completa | `User.accountType`, `POST /auth/m2m-token`, seed `npm run abac:seed:m2m`, 4 service accounts creados |
| Fase 3 — Entra ID (Azure AD) | ✅ Completa | `EntraIdService` con JWKS, `JwtGuard` detecta issuer, `POST /auth/entra-sync`, `User.entraId` |
| Fase 4 — Limpiar ABAC | ⏳ Pendiente | — |
| Fase 5 — Reemplazar x-internal-token | ⏳ Pendiente | — |

### Arquitectura actual (post Fase 1-3)

```
Customer App
    │ Entra ID JWT  (o ABAC JWT durante transición)
    ▼
api-gateway :3000
    │  JwtGuard detecta issuer:
    │  ├─ Entra ID token → JWKS validation → POST /auth/entra-sync → userId+permisos
    │  └─ ABAC token     → JWT_SECRET local (compatibilidad hasta Fase 4)
    │
    ├─► monolith :3001  [x-internal-token]
    │       └─► POST {API_GATEWAY_URL}/outbound/servicenow/* o /outbound/integration/*
    │
    └─► outbound/integration/*  [x-internal-token]
            └─► integration-service :3008
                    ├──► api-snowq-service :3090 → ServiceNow
                    ├──► Minerva :4000
                    ├──► Droppoint
                    └──► Outlook Calendar

abac-microservice :3005
    ├── POST /auth/login           (usuarios locales — transitorio, deprecar en Fase 4)
    ├── POST /auth/m2m-token       ✅ JWT stateless 1h para service accounts
    ├── POST /auth/entra-sync      ✅ Lazy sync oid→usuario interno+permisos
    └── POST /abac/can-access      Evaluación de permisos (roles + json-rules-engine)
```

### Variables de entorno por servicio (desarrollo)

**api-gateway** — `apps/api-gateway/.env.development`
```
AZURE_TENANT_ID=          # completar con tenant de Santander
AZURE_CLIENT_ID=          # completar con app registration
ABAC_M2M_API_KEY=         # completar tras abac:seed:m2m
ABAC_M2M_API_SECRET=      # completar tras abac:seed:m2m
INTEGRATION_SERVICE_URL=http://localhost:3008
INTERNAL_API_TOKEN=ec_12102fa5ffb62a07db34a5e75db21ba00c947141
```

**integration-service** — `integration-service/.env.development`
```
PORT=3008
INTERNAL_API_TOKEN=ec_12102fa5ffb62a07db34a5e75db21ba00c947141
ABAC_URL=http://localhost:3005
ABAC_API_KEY=             # completar tras abac:seed:m2m
ABAC_API_SECRET=          # completar tras abac:seed:m2m
```

---

## Fase 1 — Conectar integration-service al gateway ✅

> **Estado:** Implementado y en producción dev.

**Objetivo:** El gateway puede llamar a integration-service. El monolito puede pedir integraciones con Minerva, Droppoint y Outlook a través del gateway + integration-service.

**Auth temporal:** `x-internal-token` (se reemplaza en Fase 5).

### 1.1 — Cambiar puerto de integration-service

**Archivo:** `integration-service/src/infrastructure/config/configuration.ts`
```
port: parseInt(process.env.PORT || '3008', 10),
```

**Archivo:** `integration-service/.env.development` (crear si no existe)
```
PORT=3008
```

### 1.2 — Agregar guard de internal token a integration-service

**Archivo nuevo:** `integration-service/src/shared/guards/internal-token.guard.ts`

Guard NestJS que:
- Lee header `x-internal-token`
- Compara contra `configService.get('security.internalToken')`
- Rechaza con 401 si no coincide

**Archivo:** `integration-service/src/infrastructure/config/configuration.ts`
```typescript
security: {
    // ...existing
    internalToken: process.env.INTERNAL_API_TOKEN || '',
},
```

**Aplicar:** `@UseGuards(InternalTokenGuard)` en `IntegrationController`, `MinervaController`, `DroppointController`.

### 1.3 — Crear rutas de proxy en el gateway

**Archivo nuevo:** `apps/api-gateway/src/outbound/integration/integration-outbound.module.ts`

Módulo global que:
- Configura `HttpModule` con `INTEGRATION_SERVICE_URL` (default `http://localhost:3008`)
- Exporta `IntegrationOutboundController`

**Archivo nuevo:** `apps/api-gateway/src/outbound/integration/integration-outbound.controller.ts`

Controller `@InternalOnly()` con prefix `/outbound/integration`:

| Método | Ruta gateway | Proxea a integration-service |
|--------|-------------|------------------------------|
| `POST` | `/outbound/integration/appointments` | `POST /api/v1/integration/appointments` |
| `GET` | `/outbound/integration/:id` | `GET /api/v1/integration/:id` |
| `GET` | `/outbound/integration/correlation/:correlationId` | `GET /api/v1/integration/correlation/:correlationId` |
| `GET` | `/outbound/integration/minerva/devices` | `GET /api/v1/minerva/devices` |
| `GET` | `/outbound/integration/minerva/devices/:serial` | `GET /api/v1/minerva/devices/:serial` |
| `POST` | `/outbound/integration/minerva/devices/:serial/assign` | `POST /api/v1/minerva/devices/:serial/assign` |
| `POST` | `/outbound/integration/minerva/devices/:serial/release` | `POST /api/v1/minerva/devices/:serial/release` |
| `POST` | `/outbound/integration/minerva/devices/:serial/sync` | `POST /api/v1/minerva/devices/:serial/sync` |
| `GET` | `/outbound/integration/droppoint/boxes/free` | `GET /api/v1/droppoint/boxes/free` |
| `GET` | `/outbound/integration/droppoint/shipments/:externalId` | `GET /api/v1/droppoint/shipments/:externalId` |
| `POST` | `/outbound/integration/droppoint/shipments` | `POST /api/v1/droppoint/shipments` |
| `PATCH` | `/outbound/integration/droppoint/shipments/state` | `PATCH /api/v1/droppoint/shipments/state` |
| `DELETE` | `/outbound/integration/droppoint/shipments/:externalId` | `DELETE /api/v1/droppoint/shipments/:externalId` |

Header reenviado: `x-internal-token` + `x-correlation-id`.

### 1.4 — Agregar env vars al gateway

**Archivo:** `apps/api-gateway/.env.development`
```
INTEGRATION_SERVICE_URL=http://localhost:3008
```

**Archivo:** `apps/api-gateway/.env.staging` / `.env.production`
```
INTEGRATION_SERVICE_URL=http://integration-service:3008
```

### 1.5 — Agregar integration-service a PM2

**Archivo:** `monolito-event-corner_v3/ecosystem.config.js`

Agregar app:
```javascript
{
    name: 'integration-service',
    cwd: '../integration-service',
    script: 'dist/main.js',
    env_development: {
        NODE_ENV: 'development',
        PORT: 3008,
    },
}
```

### 1.6 — Alinear INTERNAL_API_TOKEN en dev

**Archivos:**
- `apps/monolith/.env.development` → `INTERNAL_API_TOKEN=dev-internal-token-shared`
- `apps/api-gateway/.env.development` → `INTERNAL_API_TOKEN=dev-internal-token-shared`
- `integration-service/.env.development` → `INTERNAL_API_TOKEN=dev-internal-token-shared`

Usar el mismo valor en los tres servicios.

### Verificación Fase 1

```bash
# 1. Arrancar todo
npm run pm2:dev  # gateway + monolith + abac
cd ../integration-service && npm run start:dev  # puerto 3008

# 2. Test directo a integration-service
curl -H "x-internal-token: dev-internal-token-shared" \
     http://localhost:3008/api/v1/minerva/devices?deviceType=laptop&cornerId=corner-001

# 3. Test via gateway
curl -H "x-internal-token: dev-internal-token-shared" \
     http://localhost:3000/outbound/integration/minerva/devices?deviceType=laptop&cornerId=corner-001

# 4. Test appointment flow
curl -X POST -H "Content-Type: application/json" \
     -H "x-internal-token: dev-internal-token-shared" \
     http://localhost:3000/outbound/integration/appointments \
     -d '{"eventType":"appointment.created","source":"monolith","payload":{"serialNumber":"SN001","appointmentId":"apt-001","userId":"user-001","cornerId":"corner-001"}}'
```

---

## Fase 2 — M2M en ABAC ✅

> **Estado:** Implementado y en producción dev.

**Objetivo:** ABAC puede emitir tokens JWT para servicios (no solo usuarios). Cada servicio tiene su propia Application + service account en ABAC.

### 2.1 — Agregar tipo de cuenta de servicio

**Archivo:** `apps/abac-microservice/src/entities/user.entity.ts`

Agregar columna:
```typescript
@Column({ type: 'enum', enum: ['user', 'service'], default: 'user' })
accountType: 'user' | 'service';
```

Un service account:
- No tiene `passwordHash` (nullable)
- No hace login via `POST /auth/login`
- Solo se autentica via API key de su Application

### 2.2 — Endpoint M2M token

**Archivo nuevo:** método en `apps/abac-microservice/src/abac/services/auth.service.ts`

```typescript
async generateM2MToken(apiKey: string, apiSecret: string): Promise<Result<M2MTokenResponse>> {
    // 1. Validar apiKey + apiSecret contra Application
    // 2. Verificar application.status === 'active' && !expired
    // 3. Cargar owner (service account) → roles → permisos
    // 4. Generar JWT con claims:
    //    { sub: owner.id, type: 'service', applicationId, permissions: [...] }
    // 5. TTL: 1 hora (sin refresh — el servicio pide nuevo token cuando expira)
    // 6. NO crear sesión Redis
}
```

**Archivo:** `apps/abac-microservice/src/abac/controllers/auth.controller.ts`

Nuevo endpoint:
```typescript
@Post('m2m-token')
async getM2MToken(@Body() dto: { apiKey: string; apiSecret: string }) {
    return this.authService.generateM2MToken(dto.apiKey, dto.apiSecret);
}
```

**Response:**
```json
{
    "accessToken": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "serviceAccount": { "id": "...", "name": "svc-gateway" },
    "application": { "id": "...", "name": "api-gateway" },
    "permissions": ["integration:create", "integration:read", ...]
}
```

### 2.3 — Permisos para servicios

**Seed de permisos M2M:**

| Permission | Resource | Action | Quién lo tiene |
|-----------|----------|--------|----------------|
| `integration:create` | integration | create | gateway, monolith |
| `integration:read` | integration | read | gateway, monolith |
| `minerva:read` | minerva | read | gateway, monolith |
| `minerva:assign` | minerva | assign | gateway |
| `minerva:release` | minerva | release | gateway |
| `droppoint:read` | droppoint | read | gateway, monolith |
| `droppoint:create` | droppoint | create | gateway |
| `droppoint:update` | droppoint | update | gateway |
| `droppoint:cancel` | droppoint | cancel | gateway |
| `servicenow:create` | servicenow | create | gateway, integration-service |
| `servicenow:read` | servicenow | read | gateway, monolith |

### 2.4 — Seed de Applications y Service Accounts

**Archivo:** seed script en abac-microservice

```
Applications:
  - name: "api-gateway",         env: "development", owner: svc-gateway
  - name: "monolith",            env: "development", owner: svc-monolith
  - name: "integration-service", env: "development", owner: svc-integration
  - name: "api-snowq-service",   env: "development", owner: svc-snowq

Service Accounts (User type='service'):
  - svc-gateway         → role: gateway-service      → perms: integration:*, minerva:*, droppoint:*, servicenow:read
  - svc-monolith        → role: monolith-service     → perms: integration:create, integration:read, servicenow:*
  - svc-integration     → role: integration-service  → perms: servicenow:create, minerva:*, droppoint:*
  - svc-snowq           → role: snowq-service        → perms: servicenow:*
```

### Verificación Fase 2

```bash
# 1. Obtener M2M token
curl -X POST http://localhost:3005/auth/m2m-token \
     -H "Content-Type: application/json" \
     -d '{"apiKey":"app_gateway_dev_xxx","apiSecret":"sec_gateway_dev_xxx"}'

# 2. Verificar claims del JWT (decode sin validar)
echo "<token>" | cut -d. -f2 | base64 -d | jq .

# 3. Validar token
curl -X POST http://localhost:3005/auth/validate-token \
     -H "Content-Type: application/json" \
     -d '{"token":"<token>"}'
```

---

## Fase 3 — Autenticación de usuarios via Microsoft Entra ID ✅

> **Estado:** Implementado. `EntraIdService` con caché JWKS 10 min, `JwtGuard` detecta issuer automáticamente, `POST /auth/entra-sync` en ABAC para lazy sync. Pendiente: completar `AZURE_TENANT_ID` y `AZURE_CLIENT_ID` en `.env` con valores del tenant de Santander.

**Objetivo:** Los usuarios humanos se autentican con Entra ID. El gateway valida tokens de Entra ID (no de ABAC). ABAC mapea el `oid` de Entra ID a un usuario interno con roles.

### 3.1 — Configurar Entra ID (Azure Portal)

Requisitos previos (fuera del código):
1. Registrar aplicación en Azure AD → obtener `clientId` + `tenantId`
2. Configurar redirect URIs para el frontend
3. Definir `api://event-corner` como App ID URI
4. Crear grupos de seguridad en Azure AD:
   - `SG-EventCorner-Admins`
   - `SG-EventCorner-Technicians`
   - `SG-EventCorner-Managers`
   - `SG-EventCorner-Employees`
5. Configurar que el token incluya claim `groups` (o `_claim_names` si hay +150 grupos)

### 3.2 — Instalar dependencias en gateway

```bash
cd monolito-event-corner_v3
npm install jwks-rsa --save
```

### 3.3 — Nuevo JwtGuard que valide Entra ID

**Archivo:** `apps/api-gateway/src/auth/guards/jwt.guard.ts` (reescribir)

Flujo:
```
1. @Public() → skip
2. @Internal() → validar x-internal-token (temporal, se elimina en Fase 5)
3. Bearer token → ¿es JWT M2M (issuer: abac-service)?
   → Sí: validar con JWT_SECRET local (claims de servicio)
   → No: validar contra JWKS de Entra ID:
         issuer: https://login.microsoftonline.com/{tenantId}/v2.0
         audience: api://event-corner (o clientId)
         Extraer: oid, email, preferred_username, groups
4. Inyectar en request.user:
   { userId: oid, email, type: 'user' | 'service', groups?, permissions? }
```

**Env vars nuevas en gateway:**
```
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<client-id>  # audience del token
ENTRA_JWKS_URI=https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys
```

### 3.4 — Mapeo Entra ID oid → usuario interno en ABAC

**Archivo:** `apps/abac-microservice/src/entities/user.entity.ts`

Agregar columna:
```typescript
@Column({ type: 'varchar', length: 100, unique: true, nullable: true })
entraId: string | null;  // Azure AD Object ID (oid)
```

**Archivo:** `apps/abac-microservice/src/abac/services/abac.service.ts`

Nuevo método o extensión de `canAccess()`:
```typescript
async canAccessByEntraId(entraId: string, resource: string, action: string): Promise<{ granted: boolean }> {
    // 1. Buscar User por entraId
    // 2. Si no existe → crear automáticamente (just-in-time provisioning)
    // 3. Resolver roles y permisos del usuario
    // 4. Evaluar json-rules-engine
    // 5. Retornar granted
}
```

**Archivo:** `apps/abac-microservice/src/abac/controllers/abac.controller.ts`

Nuevo endpoint o extensión:
```typescript
@Post('can-access')
// Acepta tanto userId (UUID interno) como entraId (oid de Azure AD)
// Si recibe entraId, busca/crea el usuario y resuelve permisos
```

### 3.5 — Sincronización de grupos Entra ID → Roles ABAC

**Estrategia: Lazy sync (en cada request).**

Cuando el gateway valida un token de Entra ID y llama `POST /abac/can-access`:
1. Envía los `groups` del token como contexto
2. ABAC compara con el mapeo configurado
3. Si los roles del usuario no coinciden con sus grupos → actualiza

**Archivo nuevo:** `apps/abac-microservice/src/abac/services/entra-sync.service.ts`

```typescript
async syncUserFromEntraId(entraId: string, email: string, groups: string[]): Promise<User> {
    // 1. Buscar usuario por entraId
    // 2. Si no existe → crear con accountType='user', entraId, email
    // 3. Mapear groups → roles usando tabla de configuración
    // 4. Actualizar UserRole si hay diff
    // 5. Retornar usuario
}
```

**Tabla de mapeo (seed o config):**

| Entra ID Group (objectId) | ABAC Role |
|---------------------------|-----------|
| `<oid-admins-group>` | admin |
| `<oid-technicians-group>` | technician |
| `<oid-managers-group>` | corner-manager |
| `<oid-employees-group>` | employee |

### 3.6 — Actualizar AbacClient en gateway

**Archivo:** `apps/api-gateway/src/auth/abac.client.ts`

Modificar `canAccess()`:
```typescript
async canAccess(userId: string, resource: string, action: string, context?: {
    entraId?: string;
    email?: string;
    groups?: string[];
}): Promise<{ granted: boolean }> {
    // Enviar entraId + groups como contexto adicional
    // ABAC hace lazy sync + evaluación de permisos
}
```

### Verificación Fase 3

```bash
# 1. Obtener token de Entra ID (via browser o CLI)
az account get-access-token --resource api://event-corner

# 2. Llamar gateway con token de Entra ID
curl -H "Authorization: Bearer <entra-token>" \
     http://localhost:3000/api/v1/incidents

# 3. Verificar que ABAC creó el usuario automáticamente
curl http://localhost:3005/users?entraId=<oid>

# 4. Verificar que los roles se sincronizaron
curl "http://localhost:3005/abac/user-roles?userId=<internal-id>&applicationId=<app-id>"
```

---

## Fase 4 — Limpiar ABAC (eliminar auth de usuarios)

**Objetivo:** ABAC deja de gestionar passwords y sesiones de usuario. Se convierte en motor de autorización puro + emisor de tokens M2M.

### 4.1 — Deprecar endpoints de login de usuario

**No eliminar inmediatamente** — marcar como deprecated y agregar warning en logs.

**Archivo:** `apps/abac-microservice/src/abac/controllers/auth.controller.ts`

```typescript
@Post('login')
@Deprecated()  // o agregar header X-Deprecated: true en la respuesta
async login(@Body() dto, @Req() req) {
    this.logger.warn('POST /auth/login is deprecated — use Entra ID authentication');
    // mantener funcionalidad para backward compatibility durante migración
}
```

### 4.2 — Hacer passwordHash nullable

**Archivo:** `apps/abac-microservice/src/entities/user.entity.ts`

```typescript
@Column({ type: 'varchar', length: 100, nullable: true })
passwordHash: string | null;
```

Los nuevos usuarios creados via lazy sync desde Entra ID no tienen password.

### 4.3 — Simplificar sesiones Redis

Las sesiones de usuario se eliminan progresivamente. Las únicas sesiones que quedan son:
- Cache de decisiones de autorización (1h TTL)
- Cache de API key validations (1h TTL)

**No eliminar SessionService de golpe** — reducir TTL de sesiones de usuario a 0 en la config para que no se creen nuevas.

### 4.4 — Actualizar seed

**Archivo:** seed script de abac-microservice

- Los usuarios humanos se crean sin password, con `entraId` poblado
- Los service accounts se crean con `accountType: 'service'`
- Las applications se crean con API keys para los servicios

### Verificación Fase 4

```bash
# 1. Verificar que login con password sigue funcionando (backward compat)
curl -X POST http://localhost:3005/auth/login \
     -H "x-api-key: app_xxx" \
     -d '{"email":"admin@test.com","password":"xxx"}'
# Debe funcionar pero loguear warning

# 2. Verificar que nuevo usuario sin password funciona via Entra ID
# (creado automáticamente en Fase 3)

# 3. Verificar que M2M token funciona
curl -X POST http://localhost:3005/auth/m2m-token \
     -d '{"apiKey":"app_gw_xxx","apiSecret":"sec_gw_xxx"}'
```

---

## Fase 5 — Reemplazar x-internal-token por JWT M2M

**Objetivo:** Eliminar el token hardcodeado. Cada servicio se autentica con JWT M2M emitido por ABAC.

### 5.1 — Cada servicio obtiene su token M2M al arrancar

**Patrón:** Cada servicio tiene un `M2MAuthService` que al iniciar:
1. Lee `ABAC_API_KEY` + `ABAC_API_SECRET` del env
2. Llama `POST {ABAC_URL}/auth/m2m-token`
3. Almacena el JWT en memoria
4. Renueva automáticamente antes de que expire (ej: cada 50 min si TTL es 1h)

**Archivo nuevo en cada servicio:** `src/auth/m2m-auth.service.ts` (o en `libs/shared`)

```typescript
@Injectable()
export class M2MAuthService implements OnModuleInit {
    private token: string;
    private expiresAt: number;

    async onModuleInit() { await this.refreshToken(); }

    async getToken(): Promise<string> {
        if (Date.now() >= this.expiresAt - 60_000) await this.refreshToken();
        return this.token;
    }

    private async refreshToken() {
        const res = await POST `${ABAC_URL}/auth/m2m-token` { apiKey, apiSecret };
        this.token = res.accessToken;
        this.expiresAt = Date.now() + res.expiresIn * 1000;
    }
}
```

### 5.2 — Gateway valida JWT M2M en lugar de x-internal-token

**Archivo:** `apps/api-gateway/src/auth/guards/jwt.guard.ts`

Eliminar la rama `@Internal() → validar x-internal-token`.
Reemplazar por: validar Bearer token como JWT M2M (issuer: `abac-service`, claim `type: 'service'`).

### 5.3 — Monolith envía JWT M2M al gateway

**Archivo:** `apps/monolith/src/infrastructure/external/servicenow/servicenow-proxy.adapter.ts`

Inyectar `M2MAuthService`. Reemplazar:
```typescript
// Antes
headers: { 'x-internal-token': this.internalToken }

// Después
headers: { 'Authorization': `Bearer ${await this.m2mAuth.getToken()}` }
```

### 5.4 — Gateway envía JWT M2M a integration-service

**Archivo:** `apps/api-gateway/src/outbound/integration/integration-outbound.controller.ts`

Inyectar `M2MAuthService`. Reemplazar:
```typescript
// Antes
headers: { 'x-internal-token': this.internalToken }

// Después
headers: { 'Authorization': `Bearer ${await this.m2mAuth.getToken()}` }
```

### 5.5 — integration-service valida JWT M2M

**Archivo:** `integration-service/src/shared/guards/internal-token.guard.ts` → renombrar a `m2m-jwt.guard.ts`

Reemplazar validación de `x-internal-token` por validación JWT:
- Verificar firma con `JWT_SECRET` (mismo que ABAC)
- Verificar claim `type === 'service'`
- Verificar claim `permissions` incluye la operación solicitada (opcional)

### 5.6 — Eliminar x-internal-token de todos los .env

**Archivos:**
- `apps/monolith/.env.*` → eliminar `INTERNAL_API_TOKEN`
- `apps/api-gateway/.env.*` → eliminar `INTERNAL_API_TOKEN`
- `integration-service/.env.*` → eliminar `INTERNAL_API_TOKEN`

**Agregar:**
```
ABAC_URL=http://localhost:3005
ABAC_API_KEY=app_<service>_xxx
ABAC_API_SECRET=sec_<service>_xxx
JWT_SECRET=<mismo que abac>
```

### 5.7 — Eliminar decorator @InternalOnly() y guard asociado

**Archivos:**
- `apps/api-gateway/src/auth/decorators/internal.decorator.ts` → eliminar
- `apps/api-gateway/src/auth/guards/internal.guard.ts` → eliminar
- Reemplazar `@InternalOnly()` por `@UseGuards(JwtGuard)` en todos los controllers outbound

### Verificación Fase 5

```bash
# 1. Verificar que monolith obtiene token M2M al arrancar
# (log: "M2M token obtained for svc-monolith, expires in 3600s")

# 2. Verificar flujo completo
curl -H "Authorization: Bearer <entra-token>" \
     -X POST http://localhost:3000/api/v1/incidents \
     -d '{"issueTypeId":"...","cornerId":"..."}'
# gateway valida Entra token → monolith crea incident → event handler
# → monolith llama gateway con M2M JWT → gateway llama integration-service con M2M JWT
# → integration-service llama ServiceNow + Minerva

# 3. Verificar que x-internal-token ya no funciona
curl -H "x-internal-token: dev-internal-token" \
     http://localhost:3000/outbound/integration/appointments
# Debe retornar 401
```

---

## Dependencias entre fases

```
Fase 1 (conectar integration-service)
    │
    ▼
Fase 2 (M2M en ABAC) ←── puede empezar en paralelo con Fase 1
    │
    ├──► Fase 3 (Entra ID) ←── depende de config Azure Portal
    │
    ▼
Fase 4 (limpiar ABAC) ←── depende de Fase 2 + 3 completadas
    │
    ▼
Fase 5 (eliminar x-internal-token) ←── depende de Fase 2 + 4
```

```
Semana 1-2:  Fase 1 + Fase 2 en paralelo
Semana 3:    Fase 3 (requiere acceso a Azure Portal)
Semana 4:    Fase 4 + Fase 5
```

---

## Archivos afectados por fase

### Fase 1
| Archivo | Acción |
|---------|--------|
| `integration-service/src/infrastructure/config/configuration.ts` | Cambiar puerto default a 3008 |
| `integration-service/.env.development` | Crear con PORT=3008, INTERNAL_API_TOKEN |
| `integration-service/src/shared/guards/internal-token.guard.ts` | Crear guard |
| `integration-service/src/presentation/controllers/*.controller.ts` | Aplicar guard |
| `apps/api-gateway/src/outbound/integration/integration-outbound.module.ts` | Crear módulo proxy |
| `apps/api-gateway/src/outbound/integration/integration-outbound.controller.ts` | Crear controller proxy |
| `apps/api-gateway/.env.development` | Agregar INTEGRATION_SERVICE_URL |
| `apps/api-gateway/.env.staging` | Agregar INTEGRATION_SERVICE_URL |
| `monolito-event-corner_v3/ecosystem.config.js` | Agregar integration-service |
| Todos los `.env.development` | Alinear INTERNAL_API_TOKEN |

### Fase 2
| Archivo | Acción |
|---------|--------|
| `apps/abac-microservice/src/entities/user.entity.ts` | Agregar `accountType` |
| `apps/abac-microservice/src/abac/services/auth.service.ts` | Agregar `generateM2MToken()` |
| `apps/abac-microservice/src/abac/controllers/auth.controller.ts` | Agregar `POST /auth/m2m-token` |
| `apps/abac-microservice/src/scripts/seed-*.ts` | Seed de service accounts + applications |
| `apps/abac-microservice/src/entities/permission.entity.ts` | Seed de permisos M2M |

### Fase 3
| Archivo | Acción |
|---------|--------|
| `apps/api-gateway/src/auth/guards/jwt.guard.ts` | Reescribir para Entra ID JWKS |
| `apps/api-gateway/src/auth/abac.client.ts` | Agregar entraId + groups en canAccess |
| `apps/api-gateway/.env.*` | Agregar AZURE_TENANT_ID, AZURE_CLIENT_ID |
| `apps/abac-microservice/src/entities/user.entity.ts` | Agregar `entraId` |
| `apps/abac-microservice/src/abac/services/entra-sync.service.ts` | Crear servicio de sync |
| `apps/abac-microservice/src/abac/services/abac.service.ts` | Extender canAccess para entraId |
| `apps/abac-microservice/src/abac/controllers/abac.controller.ts` | Actualizar endpoint can-access |

### Fase 4
| Archivo | Acción |
|---------|--------|
| `apps/abac-microservice/src/abac/controllers/auth.controller.ts` | Deprecar login |
| `apps/abac-microservice/src/entities/user.entity.ts` | passwordHash nullable |
| `apps/abac-microservice/src/scripts/seed-*.ts` | Usuarios sin password |

### Fase 5
| Archivo | Acción |
|---------|--------|
| Todos los servicios | Crear `M2MAuthService` (o en libs/shared) |
| `apps/monolith/src/infrastructure/external/servicenow/servicenow-proxy.adapter.ts` | JWT M2M en vez de x-internal-token |
| `apps/api-gateway/src/outbound/integration/integration-outbound.controller.ts` | JWT M2M |
| `apps/api-gateway/src/auth/guards/jwt.guard.ts` | Eliminar rama @Internal |
| `integration-service/src/shared/guards/internal-token.guard.ts` | Convertir a JWT M2M guard |
| Todos los `.env.*` | Eliminar INTERNAL_API_TOKEN, agregar ABAC_API_KEY + SECRET |
| `apps/api-gateway/src/auth/decorators/internal.decorator.ts` | Eliminar |

---

## Puertos finales

| Servicio | Puerto |
|----------|--------|
| api-gateway | 3000 |
| monolith | 3001 |
| abac-microservice | 3005 |
| integration-service | 3008 |
| servicenow-clone-backend | 3010 |
| api-snowq-service | 3090 |
| cache-service | 5001 (TCP) |
| broker-queue-lite | 5000 (HTTP) / 8000 (TCP) |
| MySQL (main) | 3306 |
| MySQL (abac) | 3308 |
| Redis | 6379 |
