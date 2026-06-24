# ABAC Microservice

Servicio de **Attribute-Based Access Control (ABAC)** para la plataforma Event Corner. Gestiona autenticación, autorización granular, usuarios, roles, permisos, políticas y auditoría.

- **Puerto:** `3005`
- **Swagger:** `/api-docs`
- **Métricas:** `/metrics` (Prometheus)
- **JWKS:** `/auth/.well-known/jwks.json`

## Stack

| Capa               | Tecnología                        |
|--------------------|-----------------------------------|
| Framework          | NestJS 11 + TypeScript 5.7        |
| Base de datos      | MySQL 8 — TypeORM 0.3             |
| Caché              | Redis — ioredis 5                 |
| Autenticación      | JWT HS256 (admin) + EdDSA/Ed25519 (M2M) |
| Motor de políticas | json-rules-engine                 |
| Observabilidad     | OpenTelemetry + Prometheus        |
| Documentación      | Swagger/OpenAPI                   |
| Seguridad          | Helmet, bcrypt, rate limiting     |

## Inicio rápido

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.development.example .env.development   # ajustar valores

# 3. Generar par de claves Ed25519 (primera vez)
node -e "
const nacl = require('tweetnacl');
const kp = nacl.sign.keyPair();
console.log('ED25519_PRIVATE_KEY=' + Buffer.from(kp.secretKey).toString('base64'));
console.log('ED25519_PUBLIC_KEY='  + Buffer.from(kp.publicKey).toString('base64'));
"
# Copiar ED25519_PRIVATE_KEY + ED25519_PUBLIC_KEY al .env

# 4. Base de datos (MySQL en puerto 3308)
docker-compose up -d

# 5. Semilla inicial (solo primera vez, es idempotente)
npm run seed          # crea super-admin + initial-credentials.json
npm run seed:m2m      # registra service accounts M2M

# 6. Servidor
npm run start:dev
```

## Scripts

```bash
npm run start:dev       # Modo watch (desarrollo)
npm run start:staging   # Build + run staging
npm run start:prod      # Build + run producción
npm run build           # Compilar TypeScript

npm run seed            # Paso 1: super-admin + credenciales iniciales
npm run seed:m2m        # Paso 2: service accounts M2M (emite tokens EdDSA)
npm run seed:full       # seed + seed:m2m en secuencia

npm run test            # Tests unitarios (Jest)
npm run test:cov        # Tests con cobertura
npm run test:e2e        # Tests end-to-end

npm run lint            # ESLint
npm run format          # Prettier
```

## Variables de entorno

### Servidor y base de datos

| Variable               | Descripción | Requerida |
|------------------------|-------------|-----------|
| `PORT`                 | Puerto del servidor (default: 3005) | No |
| `NODE_ENV`             | `development` \| `staging` \| `production` | Sí |
| `DB_HOST`              | Host MySQL | Sí |
| `DB_PORT`              | Puerto MySQL (default: 3308) | No |
| `DB_NAME`              | Nombre de base de datos | Sí |
| `DB_USERNAME`          | Usuario MySQL | Sí |
| `DB_PASSWORD`          | Contraseña MySQL | Sí |
| `SYNCHRONIZE_DATABASE` | Sincronizar schema — **nunca `true` en staging/prod** | No |
| `REDIS_HOST`           | Host Redis | Sí |
| `REDIS_PORT`           | Puerto Redis (default: 6379) | No |

### JWT y tokens

| Variable               | Descripción | Requerida |
|------------------------|-------------|-----------|
| `JWT_SECRET`           | Secreto HS256 para tokens de **admin login** y validación interna | Sí |
| `JWT_ISSUER`           | Emisor del token (default: `abac-service`) | No |
| `JWT_AUDIENCE`         | Audiencia del token (default: `abac-clients`) | No |
| `JWT_EXPIRES_IN`       | Duración de tokens admin (default: `7d`) | No |

> En staging y producción el servidor lanza excepción si `JWT_SECRET` no está configurado.

### Ed25519 — tokens M2M (servicio a servicio)

| Variable               | Descripción | Requerida |
|------------------------|-------------|-----------|
| `ED25519_PRIVATE_KEY`  | Clave privada en Base64 (64 bytes). **Solo en ABAC.** Firma los JWT M2M de infraestructura | Sí (para M2M) |
| `ED25519_PUBLIC_KEY`   | Clave pública en Base64 (32 bytes). También debe estar en api-gateway, monolith, api-snowq | Sí (para M2M) |
| `ED25519_KID`          | ID de clave para el header JWKS (default: `abac-m2m-v1`) | No |

**Servicios que necesitan `ED25519_PUBLIC_KEY`** (para verificar tokens M2M):

| Servicio | Variable | Descripción |
|---|---|---|
| `abac-microservice` | `ED25519_PRIVATE_KEY` + `ED25519_PUBLIC_KEY` | Firma y verifica |
| `api-gateway` | `ED25519_PUBLIC_KEY` | Solo verifica — reemplaza `JWT_SECRET` para M2M |
| `monolith` | `ED25519_PUBLIC_KEY` | Solo verifica — reemplaza `JWT_SECRET` para M2M |
| `api-snowq-service` | `ED25519_PUBLIC_KEY` | Solo verifica — reemplaza `JWT_SECRET` para M2M |

> La clave pública se obtiene también via `GET /auth/.well-known/jwks.json` y puede verse en el dashboard.

**Generar un par de claves:**
```bash
node -e "
const nacl = require('tweetnacl');
const kp = nacl.sign.keyPair();
console.log('ED25519_PRIVATE_KEY=' + Buffer.from(kp.secretKey).toString('base64'));
console.log('ED25519_PUBLIC_KEY='  + Buffer.from(kp.publicKey).toString('base64'));
"
```

**Rotar claves** (sin downtime):
1. Generar nuevo par con el comando anterior
2. Actualizar `ED25519_PRIVATE_KEY` en ABAC y reiniciar
3. Actualizar `ED25519_PUBLIC_KEY` en todos los servicios verificadores y reiniciar
4. El `ED25519_KID` en el JWKS cambiará; actualizar si se monitorea

### Azure / Entra ID

| Variable               | Descripción | Requerida |
|------------------------|-------------|-----------|
| `AZURE_TENANT_ID`      | Tenant ID de Azure AD | Solo Entra ID |
| `AZURE_CLIENT_ID`      | Client ID de la app Entra | Solo Entra ID |
| `AZURE_JWKS_URI`       | URI del endpoint JWKS de Azure (auto si no se provee) | No |

### Otros

| Variable               | Descripción | Requerida |
|------------------------|-------------|-----------|
| `CORS_ORIGINS`         | Orígenes CORS separados por coma | No |
| `API_RATE_LIMIT`       | Requests por ventana global (default: 200) | No |
| `LOG_LEVEL`            | `debug` \| `info` \| `warn` \| `error` | No |
| `SERVICE_NAME`         | Nombre del servicio para trazas OTel | No |

## Arquitectura

### Módulo principal (`src/abac/`)

```
abac/
├── controllers/         # 9 controladores HTTP
├── services/            # 12 servicios de negocio
├── guards/              # ApiKeyGuard, JwtAuthGuard, RolesGuard
├── strategies/          # Estrategias Passport (JWT, API Key)
├── decorators/          # @Roles(), @Public(), @CurrentUser()
├── interceptors/        # AuditInterceptor
├── dtos/                # DTOs con class-validator
├── interfaces/          # Tipos compartidos
└── abac.module.ts
```

### Entidades (`src/entities/`)

```
User ──────────────────► UserRole ──► Role ──► RolePermission ──► Permission
  │                        │                                          │
  └──► UserApplication ──► Application ──► Policy ──► PolicyPermission
  │                                          │
  └──► UserPolicyAssignment ◄────────────────┘
                                 │
                           PolicyRule (conditions JSON)
```

| Entidad | Descripción |
|---|---|
| `User` | Usuario humano (`accountType: 'user'`) o cuenta de servicio (`'service'`) |
| `Application` | App registrada: `internal` (ad-hoc), `oauth_client`, `entra_app`, `m2m_service` |
| `Role` | Rol agrupador de permisos, vinculado a una Application |
| `Permission` | Par `resource:action` (ej. `incident:create`) |
| `Policy` | Regla de acceso con efecto `allow`/`deny` y condiciones JSON |
| `PolicyRule` | Condición individual de una Policy (formato json-rules-engine) |
| `UserRole` | Asignación User ↔ Role por Application |
| `UserApplication` | Membresía User ↔ Application con atributos |
| `UserPolicyAssignment` | Asignación directa User ↔ Policy |
| `AuditLog` | Registro de auditoría de todas las acciones |

### Pipeline de evaluación ABAC

```
canAccess(userId, appId, resource, action, context)
    │
    ├─ 1. validateUserApplication  → ¿usuario tiene acceso a la app?
    │
    ├─ 2. getUserPermissions
    │       ├─ Permisos por roles (deny > allow)
    │       └─ Permisos por políticas asignadas
    │
    └─ 3. evaluatePolicies (json-rules-engine)
            Facts = { user, application, membership, context, timestamp }
            → allow | deny | null (sin política → permite si tiene permiso)
```

## API Reference

### Autenticación (`/auth`)

| Método | Endpoint | Descripción | Auth |
|---|---|---|---|
| POST | `/auth/admin/login` | Login email + password → JWT HS256 | — |
| POST | `/auth/service-token` | Token 1h para integraciones ad-hoc (type=internal). Rechaza `m2m_service` | — |
| POST | `/auth/oauth/token` | OAuth 2.0 Client Credentials (RFC 6749) → JWT HS256 | — |
| POST | `/auth/validate-token` | Verificar JWT HS256 | ApiKey |
| POST | `/auth/validate-api-key` | Verificar credenciales de aplicación | ApiKey |
| POST | `/auth/validate-entra` | Validar token Azure AD + lazy sync | ApiKey |
| POST | `/auth/dev/simulate-entra` | [Solo dev] Simular login Entra sin token real | JWT Admin |
| GET  | `/auth/.well-known/jwks.json` | Clave pública Ed25519 en formato JWKS (RFC 7517). Usada por verificadores M2M | — |

### Evaluación ABAC (`/abac`)

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/abac/can-access` | Evaluar si el usuario puede realizar una acción |
| GET | `/abac/user-roles` | Roles del usuario para una aplicación |
| POST | `/abac/batch-evaluate` | Evaluación múltiple en una sola request |

### Usuarios (`/users`)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/users` | Listar usuarios (paginado, búsqueda, filtros) |
| POST | `/users` | Crear usuario |
| GET | `/users/:id` | Obtener usuario por ID |
| PATCH | `/users/:id` | Actualizar usuario |
| DELETE | `/users/:id` | Desactivar usuario (soft delete) |
| POST | `/users/:id/reactivate` | Reactivar usuario |
| DELETE | `/users/:id/permanent` | Eliminar definitivamente |
| GET | `/users/:id/roles` | Roles asignados |
| POST | `/users/:id/roles` | Asignar rol |
| DELETE | `/users/:id/roles/:roleId` | Quitar rol |
| GET | `/users/:id/applications` | Aplicaciones del usuario |
| POST | `/users/:id/applications` | Asignar aplicación |
| DELETE | `/users/:id/applications/:appId` | Quitar aplicación |
| GET | `/users/:id/policies` | Políticas asignadas directamente |

### Roles (`/roles`)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/roles` | Listar roles (`?applicationId`, paginado) |
| POST | `/roles` | Crear rol |
| GET | `/roles/:id` | Obtener rol con permisos |
| PATCH | `/roles/:id` | Actualizar rol |
| DELETE | `/roles/:id` | Desactivar rol |
| POST | `/roles/:id/reactivate` | Reactivar rol |
| DELETE | `/roles/:id/permanent` | Eliminar definitivamente |
| GET | `/roles/:id/permissions` | Permisos del rol |
| POST | `/roles/:id/permissions` | Asignar permiso al rol |
| DELETE | `/roles/:id/permissions/:permId` | Quitar permiso del rol |

### Permisos (`/permissions`)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/permissions` | Listar permisos (filtros: `resource`, `category`, `isActive`) |
| POST | `/permissions` | Crear permiso (`resource:action`) |
| GET | `/permissions/:id` | Obtener permiso |
| PATCH | `/permissions/:id` | Actualizar |
| DELETE | `/permissions/:id` | Desactivar |
| POST | `/permissions/:id/reactivate` | Reactivar |
| DELETE | `/permissions/:id/permanent` | Eliminar definitivamente |

### Aplicaciones (`/applications`)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/applications` | Listar aplicaciones |
| POST | `/applications` | Crear aplicación `internal` |
| POST | `/applications/oauth` | Registrar cliente OAuth 2.0 |
| POST | `/applications/m2m-service` | Registrar servicio de infraestructura M2M |
| GET | `/applications/:id` | Obtener aplicación |
| PATCH | `/applications/:id` | Actualizar |
| DELETE | `/applications/:id` | Desactivar |
| POST | `/applications/:id/reactivate` | Reactivar |
| DELETE | `/applications/:id/permanent` | Eliminar definitivamente |
| POST | `/applications/:id/issue-token` | **Emitir JWT EdDSA para servicio M2M** (firma con Ed25519) |
| PATCH | `/applications/:id/scopes` | Actualizar scopes (OAuth clients) |
| POST | `/applications/:id/regenerate-api-key` | Rotar apiKey (apps internal) |
| POST | `/applications/:id/rotate-secret` | Rotar secret (OAuth clients) |

### Políticas (`/policies`)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/policies` | Listar políticas |
| POST | `/policies` | Crear política |
| GET | `/policies/:id` | Obtener política con reglas |
| PUT | `/policies/:id` | Actualizar política |
| DELETE | `/policies/:id` | Eliminar/desactivar |
| POST | `/policies/:id/rules` | Agregar regla |
| DELETE | `/policies/:id/rules/:ruleId` | Eliminar regla |
| POST | `/policies/:id/permissions` | Asociar permiso |
| DELETE | `/policies/:id/permissions/:permId` | Desasociar permiso |

### Auditoría (`/audit`)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/audit` | Listar eventos (paginado, filtros) |
| GET | `/audit/stats` | Estadísticas agregadas por período |
| GET | `/audit/recent` | Últimos N eventos |

## Mecanismos de autenticación

### 1. Usuarios humanos — Entra ID (Azure AD)

Tokens Azure AD validados mediante JWKS (RS256). El usuario se sincroniza automáticamente en la primera autenticación (lazy sync). Para `accountType: 'user'`.

```
Cliente  →  api-gateway  →  POST /auth/validate-entra  →  ABAC
                              token Azure AD + applicationId
                              ← { userId, permissions[], oid, email }
```

### 2. Servicios de infraestructura — JWT EdDSA (Ed25519)

Para servicios internos: api-gateway, monolith, api-snowq-service, api-middleware-service, integration-service.

**Firma:** ABAC firma con `ED25519_PRIVATE_KEY` (curva Ed25519, algoritmo EdDSA).
**Verificación:** cada servicio verifica localmente con `ED25519_PUBLIC_KEY` — nunca necesita la clave privada ni `JWT_SECRET`.
**Duración:** configurable por servicio (`tokenDurationDays`), típicamente 90–365 días.

```
# Flujo de emisión (manual o via seed)
POST /applications/:id/issue-token
← { token (EdDSA), expiresAt }

# Configurar en el servicio
ABAC_M2M_TOKEN=<JWT EdDSA>       # en .env del servicio
ED25519_PUBLIC_KEY=<base64 32B>  # mismo en todos los verificadores

# Verificación (local, sin red)
JwtEd25519Service.verifyWithKey(publicKey, token)
```

**La clave pública** se obtiene desde el dashboard (`/applications` → tab M2M) o via JWKS:
```bash
curl http://localhost:3005/auth/.well-known/jwks.json
# { "keys": [{ "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "kid": "abac-m2m-v1", "x": "..." }] }
```

### 2b. Integraciones ad-hoc — token 1h (HS256)

Para apps `type: 'internal'` que se autentican puntualmente. Intercambian `apiKey` + `apiSecret` en `POST /auth/service-token` y obtienen un JWT HS256 válido por 1 hora. Las apps `m2m_service` son rechazadas aquí.

### 3. OAuth 2.0 Client Credentials (apps externas)

Para apps externas. Scopes en formato `resource:action`. Los scopes concedidos son la intersección de: solicitados, `application.scopes`, y permisos del owner.

```
POST /auth/oauth/token
{ "grant_type": "client_credentials", "client_id": "...", "client_secret": "...", "scope": "incident:read" }
← { "access_token": "...", "token_type": "Bearer", "expires_in": 3600, "scope": "incident:read" }
```

Validación por los consumidores via introspección (RFC 7662) — no hay verificación local.

### Tabla resumen

| Tipo de token | Algoritmo | Firmado por | Verificado por | Duración |
|---|---|---|---|---|
| Admin login | HS256 | ABAC (`JWT_SECRET`) | ABAC (centralizado) | 7d |
| M2M infraestructura | **EdDSA/Ed25519** | ABAC (`ED25519_PRIVATE_KEY`) | Cada servicio localmente (`ED25519_PUBLIC_KEY`) | 90–365d |
| Ad-hoc (internal) | HS256 | ABAC (`JWT_SECRET`) | ABAC (centralizado) | 1h |
| OAuth CC | HS256 | ABAC (`JWT_SECRET`) | ABAC via introspección | configurable |
| Entra ID | RS256 | Azure AD (JWKS) | ABAC via Azure JWKS | según Azure |

### Caché Redis

| Datos | TTL | Descripción |
|---|---|---|
| Permisos de usuario | 5 min | Resultado de `getUserPermissions` |
| Validación API key | 5 min | Cache-first para `ApiKeyGuard` |
| Rate limit por API key | 1 min | Ventana deslizante (100 req/min por key) |

## Guards

| Guard | Activación | Descripción |
|---|---|---|
| `JwtAuthGuard` | `@UseGuards(JwtAuthGuard)` | Valida JWT HS256 en `Authorization: Bearer` |
| `ApiKeyGuard` | `@UseGuards(ApiKeyGuard)` | Valida `x-api-key` con caché Redis + rate limit |
| `RolesGuard` | `@UseGuards(RolesGuard)` | Requiere rol específico (`@Roles()`) |

## Infraestructura

### Docker (MySQL en puerto 3308)

```bash
docker-compose up -d
```

### Base de datos

```sql
CREATE DATABASE IF NOT EXISTS abac_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Con `SYNCHRONIZE_DATABASE=true` (solo development) TypeORM sincroniza el schema automáticamente. En staging/prod usar migraciones:

```bash
npm run migration:run
```

### Migraciones pendientes (aplicar manualmente en staging/prod)

```sql
ALTER TABLE applications ADD COLUMN ownerApplicationId VARCHAR(36) NULL;
ALTER TABLE applications ADD CONSTRAINT fk_app_owner_app
  FOREIGN KEY (ownerApplicationId) REFERENCES applications(id) ON DELETE SET NULL;
```

## Observabilidad

- **Swagger UI:** `http://localhost:3005/api-docs`
- **Métricas Prometheus:** `http://localhost:3005/metrics`
- **JWKS:** `http://localhost:3005/auth/.well-known/jwks.json`
- **Logs:** Winston con rotación diaria en `logs/`
- **Trazas:** OpenTelemetry (exportador configurable via env)

## Tests

```bash
npm run test          # 53 tests unitarios (3 suites)
npm run test:cov      # Con reporte de cobertura
npm run test:e2e      # Tests de integración
```

Suites cubiertas: `AbacService`, `AuthService`, `PermissionService`.

## Semilla de datos

```bash
# Orden de ejecución (primera vez, idempotente):

# Paso 1 — desde abac-microservice/
npm run seed
# Genera: super-admin, roles del sistema, permisos base, aplicación interna
# Produce: initial-credentials.json con credenciales del admin

# Paso 2 — desde abac-microservice/
npm run seed:m2m
# Registra service accounts para: monolith, api-gateway, api-snowq-service, api-middleware-service
# Emite JWT EdDSA para cada servicio (firmados con ED25519_PRIVATE_KEY)
# Actualiza los .env de cada servicio con ABAC_M2M_TOKEN

# Alternativa: ambos pasos en secuencia
npm run seed:full
```

> El seed del monolith (Paso 2 en el ecosistema completo) lee `initial-credentials.json` automáticamente.

## Configuración completa de ejemplo (`.env.development`)

```env
# Servidor
PORT=3005
NODE_ENV=development
SERVICE_NAME=abac-microservice
LOG_LEVEL=debug

# Base de datos
DB_HOST=localhost
DB_PORT=3308
DB_USERNAME=root
DB_PASSWORD=root
DB_NAME=abac_db
SYNCHRONIZE_DATABASE=true

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT — admin tokens (HS256)
JWT_SECRET=dev-jwt-secret-change-in-prod
JWT_ISSUER=abac-service
JWT_AUDIENCE=abac-clients
JWT_EXPIRES_IN=7d

# Ed25519 — tokens M2M de infraestructura (EdDSA)
# Generar con: node -e "const n=require('tweetnacl'),k=n.sign.keyPair();console.log('PRIV='+Buffer.from(k.secretKey).toString('base64')+'\nPUB='+Buffer.from(k.publicKey).toString('base64'))"
ED25519_PRIVATE_KEY=<base64 64 bytes — solo en ABAC>
ED25519_PUBLIC_KEY=<base64 32 bytes — copiar también a api-gateway, monolith, api-snowq>
ED25519_KID=abac-m2m-v1

# Azure Entra ID (opcional en dev — usar /auth/dev/simulate-entra)
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_JWKS_URI=

# Seguridad
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
API_RATE_LIMIT=200
```
