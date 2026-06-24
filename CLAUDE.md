# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ecosystem Overview

This workspace is a microservices ecosystem for the **Event Corner** platform. Services must be started in dependency order:

```
MySQL + Redis → servicenow-clone-backend → api-snowq-service
             → abac-microservice → monolith → api-gateway
             → integration-service (independent, needs api-gateway)
             → observability-service (independent telemetry sink)
```

> **Nota:** `api-middleware-service` fue **retirado** de la infraestructura. La carpeta puede seguir existiendo en el workspace, pero ya no forma parte del ecosistema ni del flujo entre servicios; ignórala.

## Services and Ports

| Service | Port (staging/prod) | Notes |
|---|---|---|
| api-gateway | 3000 | Swagger: `/docs`. **Dev usa :4000** (`API_GATEWAY_PORT`) |
| monolith | 3001 | Internal only. **Dev usa :3002** (`MONOLITH_PORT`) |
| abac-microservice | 3005 | Swagger: `/api-docs`, Metrics: `/metrics` |
| integration-service | 3008 | External integrations (Minerva, ERPs). CQRS + Event Sourcing. Swagger: `/api/docs` |
| api-snowq-service | 3090 | Queue + circuit breaker for ServiceNow |
| observability-service | 3099 | Telemetry sink: `/ingest/logs`, `/ingest/metrics`, `/ingest/traces` |
| observability-dashboard | — | Front (Vite) para visualizar telemetría del observability-service |
| servicenow-clone-backend | 3010 | Local ServiceNow mock (dev only) |
| event-corner-app | — | Front (Vite) del cliente Event Corner |
| MySQL (main) | 3306 | Databases: `event_corner`, `incidences_dbase`, `servicenow_clone` |
| MySQL (abac) | 3308 | Database: `abac_db` |
| Redis | 6379 | Sessions and cache |

## Development Commands

### monolito-event-corner_v3 (monorepo)
```bash
cd monolito-event-corner_v3
npm install

# Start individual services
npm run start:monolith:dev    # monolith (dev :3002)
npm run start:api-gateway:dev # api-gateway (dev :4000)

# Or use PM2 for all services (includes abac, integration-service)
npm run pm2:dev
npm run pm2:logs / pm2:status / pm2:stop / pm2:delete

# Build
npm run build:all             # builds api-gateway + monolith only

# Tests
npm test                      # all tests
npm run test:cov              # with coverage
npm run test:e2e

# Seeds (run in order, first time only — idempotent)
# Step 1: run abac seed from abac-microservice directory (see below)
npm run monolith:seed         # Step 2: reads initial-credentials.json automatically
# Step 3: run abac:seed:m2m from abac-microservice directory
```

### abac-microservice (standalone)
```bash
cd abac-microservice
npm install
npm run start:dev             # :3005

# Seeds (run in order, first time only — idempotent)
npm run seed                  # Step 1: creates super admin, generates initial-credentials.json
npm run seed:m2m              # Registers M2M service accounts, signs Ed25519 M2M tokens
npm run seed:full             # seed + seed:m2m in sequence
```

### api-snowq-service
```bash
cd api-snowq-service
npm install
npm run start:dev
npm test
npm run test:cov
npm run test:e2e
npm run build
```

### integration-service
```bash
cd integration-service
npm install
npm run start:dev             # :3008
```

### observability-service / observability-dashboard
```bash
cd observability-service && npm run start:dev   # :3099 (ingesta de telemetría)
cd observability-dashboard && npm run dev       # front Vite
```

### servicenow-clone-backend
```bash
cd servicenow-clone-backend
npm install
npm run start:dev
npm run seed                  # Step 3 of the seed sequence
```

## Architecture

### monolito-event-corner_v3 (NestJS Monorepo)

Two apps under `apps/`:

- **api-gateway** — JWT validation via ABAC (usuarios Entra ID) + verificación local Ed25519 de tokens M2M, ABAC guards, HTTP proxy to monolith (`/internal/*`), `SnowqAdapter` for ServiceNow integration, `ExternalRecordsController` for internal-api queries
- **monolith** — Core business logic (incidents, corners, users), TypeORM + MySQL, outbox pattern, `ReconcilerJob` for async reconciliation

Shared libraries under `libs/`:
- `@app/observability` (`libs/observability/`) — Logging + métricas + trazas; transporta telemetría por HTTP al observability-service (winston-http transport con circuit breaker `@backendkit-labs/circuit-breaker`)
- `@app/shared` (`libs/shared/`) — Shared types and utilities (incluye `m2m-jwt.guard`)
- `@app/result` (`libs/result/`) — Tipo `Result` local del core (no migrar a libs externas)
- `@app/ed25519` (`libs/ed25519.service/`) — Firma/verificación de JWT EdDSA (Ed25519) con soporte de `kid` y claims (`iss`/`aud`)
- `@app/date` (`libs/date-fns/`) — Utilidades de fecha

### abac-microservice (standalone — `abac-microservice/`)

Attribute-Based Access Control engine. Three auth entry points: Entra ID (JWKS/RS256 validation + lazy user sync), M2M (apiKey+apiSecret → JWT EdDSA), OAuth 2.0 Client Credentials (scoped JWT). All converge on ABAC for authorization via `json-rules-engine`. Redis for permission/API-key caching. **Firma los tokens M2M con Ed25519 (`ED25519_PRIVATE_KEY`, `ED25519_KID`); los servicios los verifican localmente con `ED25519_PUBLIC_KEY`.**

### integration-service (standalone — `integration-service/`)

External integrations (Minerva SOAP, DropPoint, ERPs). CQRS + Event Sourcing. Sincroniza dispositivos hacia el monolith; consume snowq. Auth M2M Ed25519 contra ABAC.

### observability-service (standalone — `observability-service/`)

Sink central de telemetría (puerto 3099). Recibe logs/métricas/trazas de **todos** los servicios vía `POST /ingest/{logs,metrics,traces}`, protegido por `Ed25519Guard` (Bearer M2M). Reenvía opcionalmente a Jaeger (`JAEGER_OTLP_URL`) y Prometheus Pushgateway (`PROMETHEUS_PUSHGATEWAY_URL`) si están configurados. El `observability-dashboard` (Vite) lo consume para visualización.

### Key Architectural Patterns

1. **Outbox Pattern** — Monolith guarantees event delivery to downstream services
2. **Circuit Breaker** — `@backendkit-labs/circuit-breaker` (transportes de observability, gateway, monolith) y `opossum` (api-snowq-service)
3. **Two-Phase ServiceNow Integration** — Immediate synchronous call + async queue fallback
4. **Bulkhead** — Workload isolation by priority in api-snowq-service
5. **ABAC + Multi-Auth** — Three authentication methods (Entra ID for users, M2M for internal services, OAuth 2.0 Client Credentials for external apps) all converge on ABAC for fine-grained authorization via `json-rules-engine`. User.accountType distinguishes `'user'` (Entra ID humans) from `'service'` (M2M/OAuth Application owners). Permission chain: User → UserRole → Role → RolePermission → Permission (`resource:action`). Policy evaluation pipeline: validateUserApplication → getUserPermissions → evaluatePolicies
6. **M2M con Ed25519 (EdDSA)** — ABAC firma tokens M2M con su clave privada Ed25519. Cada servicio los verifica **localmente** con `ED25519_PUBLIC_KEY` (sin llamada de red). El header del JWT lleva `kid`; al rotar la clave hay que propagar la nueva pública a todos los consumidores y reemitir los tokens (idealmente soportando varios `kid` en tránsito)
7. **OAuth2 Scopes = ABAC Permissions** — OAuth scopes use the same `resource:action` format as ABAC permissions. Granted scopes are the intersection of: requested scopes, application allowed scopes, and owner's ABAC permissions

## Environment Configuration

Each app has `.env.development`, `.env.staging`, `.env.production` files. Critical variables that differ between environments:

| Variable | dev | staging/prod |
|---|---|---|
| `SN_INTEGRATION_ENABLED` | `false` | `true` |
| `BASE_URL_SERVICENOW` | `http://localhost:3010` | real SN instance |
| `SYNCHRONIZE_DATABASE` | `true` | **`false`** (never true in prod) |
| `RECONCILER_ENABLED` | `false` | `true` |
| `API_GATEWAY_PORT` | `4000` | `3000` |
| `MONOLITH_PORT` | `3002` | `3001` |

**Autenticación entre servicios (Ed25519):**
- `ED25519_PUBLIC_KEY` en cada servicio debe corresponder a la clave Ed25519 con la que ABAC **firmó** los tokens M2M vigentes (el `kid` del token). Si no coincide, la verificación falla con 401.
- `JWT_ISSUER` (`abac-service`) y `JWT_AUDIENCE` (`abac-clients`) deben coincidir entre ABAC y los consumidores.
- En **staging/prod** las claves se inyectan por secretos (k8s); los `.env.*` traen placeholders (`CHANGE_ME` / `REPLACE_WITH_...`). En **dev** las claves reales están en los `.env.development`.

### ServiceNow group resolution — monolith env vars

Two distinct variables control ServiceNow defaults (both in `apps/monolith/.env.*`):

| Variable | Purpose |
|---|---|
| `SN_DEFAULT_COMPANY_SYS_ID` | `sys_id` in ServiceNow for the `company` field of the ticket. Used when a company has no SN profile. |
| `SN_DEFAULT_COMPANY_ID` | Internal `company_id` in the monolith. Used to look up `CompanyIssueConfig` as fallback when a company has no group config for a given issue type. |

`resolveAssignmentGroup()` in `ServiceNowIntegrationService` follows this chain:
```
1. CompanyIssueConfig(company.id, issueTypeId)
2. CompanyIssueConfig(SN_DEFAULT_COMPANY_ID, issueTypeId)
3. Corner.snow_assignment_group
4. 'SOPORTE_GENERAL' + warn log  ← indicates missing configuration
```

In dev both point to `Santander Corporate (Default)` (`company-santander-default-001`), seeded by `npm run monolith:seed`.

### servicenow-clone-backend — closed state codes

The simulator stores state as numeric strings. `api-snowq-service` (`SN_CLOSED_STATES`) and the monolith `SnowSyncJob` recognize these as closed:

| Code | Type | Meaning |
|---|---|---|
| `6` | incident | Resolved |
| `7` | incident | Closed |
| `3` | change_request, sc_req_item, sc_task | Closed |
| `0` | change_request | Review/Resolved |
| `4` | problem, sc_req_item, sc_task | Closed/Resolved |

The simulator accepts semantic strings (`state: 'resolved'`, `state: 'closed'`) in PATCH requests and maps them to the correct numeric code per table type.

## Cross-Service Communication Map

```
Customer App / event-corner-app
    │ HTTP
    ▼
api-gateway (staging/prod :3000 · dev :4000)
    │ HTTP  Authorization: Bearer <M2M EdDSA JWT>
    ▼
monolith (staging/prod :3001 · dev :3002)
    │ HTTP  Authorization: Bearer <M2M EdDSA JWT>  →  {API_GATEWAY_URL}/outbound/servicenow/*
    ▼
api-gateway (outbound controller)
    │
    ├─ SnowqAdapter (PRIMARY for incident creation)
    │      Phase 1 SYNC:  POST {SNOWQ_URL}/snow-requests/immediate/incidents
    │      Phase 2 ASYNC: POST {SNOWQ_URL}/snow-requests/incidents
    │      Updates/close: PATCH {SERVICENOW_SIMULATOR_URL}/api/now/v2/{table}/{sysId}
    │
    └─ ServiceNowOutboundAdapter (updates/close via OAuth2 corporate gateway)
           POST/PATCH {OUTBOUND_GATEWAY_URL}/...  + Bearer token (ServiceNowTokenService)

api-snowq-service :3090
    │ Basic Auth  →  {BASE_URL_SERVICENOW}/api/now/v2/{type}
    ▼
servicenow-clone-backend :3010  (dev)  /  ServiceNow real (staging/prod)

integration-service :3008  →  api-gateway / monolith (M2M)  ·  Minerva SOAP, DropPoint
Nagios/Thruk  →  POST :3090/monitoring/alerts  →  api-snowq-service  →  ServiceNow

──────────────────────────────────────────────────
TODOS los servicios  →  observability-service :3099  (/ingest/logs · /ingest/metrics · /ingest/traces, Bearer M2M EdDSA)
```

### Background Jobs (monolith)

| Job | Interval | What it does |
|---|---|---|
| `MonolithReconcilerJob` | 30 s | Polls `GET {SNOWQ_URL}/snow-requests/{correlationId}` for incidents/requests with `snowq_correlation_id`. On DELIVERED: stores `servicenow_id`+`servicenow_number`, clears correlationId. On FAILED: logs + clears. |
| `SnowSyncJob` | 5 min | For all active incidents with `servicenow_id`, calls `GET /outbound/servicenow/incidents/{sysId}/state`. If state ∈ `{6,7}`: closes incident in monolith automatically. |

### Key env vars per service

**monolith** — `apps/monolith/.env.*`
```
API_GATEWAY_URL=http://localhost:4000   # dev (staging/prod: http://api-gateway:3000)
ABAC_URL=http://localhost:3005
ABAC_APP_ID=...
ABAC_M2M_TOKEN=...                       # JWT M2M EdDSA — obtener vía POST /auth/m2m-token
ED25519_PUBLIC_KEY=...                   # clave pública de ABAC para verificar M2M
JWT_ISSUER=abac-service
SNOWQ_URL=http://localhost:3090
SN_DEFAULT_COMPANY_SYS_ID=...
SN_DEFAULT_COMPANY_ID=...
LOG_TRANSPORT_URL=http://localhost:3099/ingest/logs
OBS_METRICS_URL=http://localhost:3099/ingest/metrics
OBS_TRACES_URL=http://localhost:3099/ingest/traces
```

**api-gateway** — `apps/api-gateway/.env.*`
```
API_GATEWAY_PORT=4000                    # dev (staging/prod: 3000)
MONOLITH_URL=http://localhost:3002       # dev (staging/prod: http://monolith:3001)
INTEGRATION_SERVICE_URL=http://localhost:3008
SERVICENOW_SIMULATOR_URL=http://localhost:3010
OUTBOUND_GATEWAY_URL=...                 # corporate gateway (prod) / mock (dev)
OUTBOUND_GATEWAY_TOKEN_URL=...           # OAuth2 token endpoint
OUTBOUND_GATEWAY_CLIENT_ID=...
OUTBOUND_GATEWAY_CLIENT_SECRET=...
SNOWQ_URL=http://localhost:3090
ABAC_URL=http://localhost:3005
ABAC_API_KEY=...
ABAC_APP_ID=...
ABAC_M2M_TOKEN=...                       # JWT M2M EdDSA
ED25519_PUBLIC_KEY=...                   # clave pública de ABAC para verificar M2M
JWT_ISSUER=abac-service
JWT_AUDIENCE=abac-clients
```

**api-snowq-service** — `api-snowq-service/.env.*`
```
BASE_URL_SERVICENOW=http://localhost:3010
SN_AUTH=...                              # base64 Basic auth
ABAC_URL=http://localhost:3005
ABAC_APP_ID=...
ABAC_M2M_TOKEN=...                       # JWT M2M EdDSA
ED25519_PUBLIC_KEY=...                   # clave pública de ABAC para verificar M2M
RECONCILER_ENABLED=false                 # true en staging/prod
RECONCILER_INTERVAL_SECONDS=300
```

**integration-service** — `integration-service/.env.*`
```
ABAC_URL=http://localhost:3005
ABAC_APP_ID=...
ABAC_M2M_TOKEN=...
ED25519_PUBLIC_KEY=...
SERVICENOW_BASE_URL=http://localhost:3010
SNOWQ_BASE_URL=http://localhost:3090
MINERVA_SOAP_WSDL_URL=http://localhost:3016/devices?wsdl
DROPPOINT_BASE_URL=...
```

**observability-service** — `observability-service/.env.*`
```
PORT=3099
ABAC_M2M_TOKEN=...
ED25519_PUBLIC_KEY=...                   # verifica los Bearer M2M entrantes
JWT_ISSUER=abac-service
JWT_AUDIENCE=abac-clients
JAEGER_OTLP_URL=                         # opcional: reenvío de trazas
PROMETHEUS_PUSHGATEWAY_URL=              # opcional: reenvío de métricas
```

## Domain Model (monolith)

### Entity Relationships

```
IssueTypeTree
    └─1:N── IssueType (catalog: name, servicenow_category, work_minutes, device_type)

Company ──FK──► IssueTypeTree
Company ──FK──► ServiceNowProfile (snow_company_sys_id)
Company ──1:N──► User
Company ──1:N──► Request

Corner
    ├─ snow_assignment_group  (SN routing fallback)
    ├─ servicenow_location    (SN location field)
    ├─1:N──► Technician
    ├─1:N──► Locker
    └─1:N──► CornerSchedule / Slot

User ──FK──► Company
User ──1:N──► Incident

Incident  (aggregate root)
    ├─FK──► User (customerId)
    ├─FK──► IssueType
    ├─FK──► Corner
    ├─FK──► Technician (current, optional)
    ├─FK──► Device (optional)
    ├─FK──► Locker (optional)
    ├─ servicenow_id / servicenow_number  (set after SN ticket created)
    ├─ snowq_correlation_id               (set during async phase, cleared on reconcile)
    └─ status: CREATED→DELIVERED→IN_PROGRESS→PAUSED→CLOSED→VALIDATED / REOPENED

Request
    ├─FK──► Company, User, Technician, Corner, IssueType, Device
    ├─ servicenow_id / servicenow_number
    └─ snowq_correlation_id

CompanyIssueConfig
    ├─FK──► Company
    ├─FK──► IssueType
    ├─ servicenow_group   (assignment_group sys_id for this company+issueType)
    └─ work_minutes_override

Device  (leaf — synced from Minerva or created as virtual)
    ├─ serial_number (unique)
    ├─ status: STALE / SYNCED / SYNC_ERROR / NOT_FOUND / VIRTUAL
    └─ is_virtual: true = on-demand onboarding, never syncs

ServiceNowGroup  (catalog table, no routing logic)
    └─ group_id (sys_id), group_name, is_active
```

## Domain Model (abac-microservice)

### Entity Relationships

```
User (universal pivot between auth and ABAC)
    ├─ accountType: 'user' (Entra ID) | 'service' (M2M/OAuth owner)
    ├─ entraId (Azure AD oid, nullable)
    ├─ email, username, firstName, lastName
    ├─ passwordHash (null for Entra ID users, dummy for service accounts)
    ├─ status, profile (JSON), lastLoginAt
    ├─1:N──► UserRole
    └─1:N──► UserApplication

Application
    ├─ apiKey, apiSecret (hashed), type ('internal' | 'oauth_client')
    ├─ scopes (JSON array, for OAuth — null = all owner perms)
    ├─ tokenDurationDays, usageCount, usageLimit, expiresAt
    ├─ environment, settings (JSON)
    ├─FK──► User (owner — service account)
    └─1:N──► UserApplication

Role
    ├─ name, description, type ('system' | 'custom'), weight
    ├─FK──► Application
    ├─1:N──► RolePermission
    └─1:N──► UserRole

Permission
    ├─ resource, action (unique pair — e.g. 'incident:create')
    ├─ description, category, weight
    └─1:N──► RolePermission, PolicyPermission

UserRole  (join: User ↔ Role per Application)
    ├─FK──► User, Role, Application

RolePermission  (join: Role ↔ Permission)
    ├─FK──► Role, Permission
    ├─ effect: 'allow' | 'deny' (deny wins)

Policy
    ├─ name, description, effect ('allow' | 'deny'), priority
    ├─ type ('system' | 'user'), conditions (JSON)
    ├─FK──► Application
    ├─1:N──► PolicyRule
    └─1:N──► PolicyPermission

PolicyRule
    ├─ condition (JSON — json-rules-engine format), priority
    ├─FK──► Policy

PolicyPermission  (join: Policy ↔ Permission)
    ├─FK──► Policy, Permission

UserApplication  (join: User ↔ Application + membership)
    ├─FK──► User, Application
    ├─ membershipType, membershipExpiresAt, attributes (JSON)

UserPolicyAssignment  (join: User ↔ Policy per Application)
    ├─FK──► User, Policy, Application
```

### ABAC Evaluation Pipeline

```
1. validateUserApplication(userId, appId)  → user has access to app?
2. getUserPermissions(userId, appId, resource, action)
   → Role permissions (deny wins over allow)
   → Policy permissions (if no resource/action filter)
3. evaluatePolicies(policies, facts)  → json-rules-engine
   Facts = { user (profile, attributes, roles), application (environment),
             membership (type, expiry), context (caller-provided + timestamp) }
   → Returns: allow | deny | null (no policy matched → allow if permission exists)
```

### Incident/Request → ServiceNow field mapping

| SN field | Source |
|---|---|
| `assignment_group` | `resolveAssignmentGroup()`: CompanyIssueConfig → default company config → Corner.snow_assignment_group |
| `company` | `resolveSnowCompanySysId()`: Company.profile.snow_company_sys_id → `SN_DEFAULT_COMPANY_SYS_ID` |
| `category` | `IssueType.servicenow_category` |
| `caller_id` | `User.principalName` (UPN) |
| `location` | `Corner.servicenow_location` |
| `correlation_id` | `Device.serial_number` |
| `expected_start` | `Incident.scheduledRange.start` |

## Key Files Reference

| File | Purpose |
|---|---|
| `monolito-event-corner_v3/ecosystem.config.js` | PM2 multi-app config (api-gateway, monolith, abac) |
| `apps/monolith/src/core/services/servicenow/servicenow-integration.service.ts` | Group + company resolution, ticket creation/close |
| `apps/monolith/src/infrastructure/external/servicenow/servicenow-proxy.adapter.ts` | Monolith → gateway HTTP calls |
| `apps/api-gateway/src/outbound/servicenow/snowq.adapter.ts` | Two-phase creation (sync + async fallback) |
| `apps/api-gateway/src/outbound/servicenow/servicenow-outbound.adapter.ts` | Corporate gateway (OAuth2) for updates/close |
| `apps/api-gateway/src/inbound/external/external-records.controller.ts` | Internal-API endpoints |
| `apps/api-gateway/src/auth/guards/jwt.guard.ts` | Verificación local Ed25519 de M2M + delegación de Entra ID a ABAC |
| `libs/shared/src/guards/m2m-jwt.guard.ts` | Guard M2M EdDSA compartido |
| `libs/ed25519.service/src/jwt-ed25519.service.ts` | Firma/verificación EdDSA con `kid`/claims |
| `libs/observability/transports/winston-http.transport.ts` | Transporte de logs vía HTTP al observability-service (circuit breaker) |
| `apps/monolith/src/infrastructure/jobs/monolith-reconciler.job.ts` | Async ticket correlation reconciliation |
| `apps/monolith/src/infrastructure/jobs/snow-sync.job.ts` | ServiceNow → monolith state polling |
| `apps/monolith/src/scripts/seed-test-data.ts` | Full seed (companies, corners, users, issue types, CICs, groups) |
| `abac-microservice/src/abac/services/auth.service.ts` | Entra ID sync, M2M token (EdDSA), OAuth 2.0 Client Credentials |
| `abac-microservice/src/abac/services/abac.service.ts` | Core ABAC engine — canAccess(), permission resolution, policy evaluation |
| `abac-microservice/src/abac/guards/api-key.guard.ts` | API key validation guard with cache-first strategy |
| `abac-microservice/src/scripts/seed-initial-data.ts` | Initial ABAC seed (users, roles, permissions, policies, applications) |
| `abac-microservice/src/scripts/seed-m2m-services.ts` | M2M service accounts seed — run after adding new services |
| `api-snowq-service/src/servicenow/client/servicenow-client.service.ts` | POST/PATCH/GET to SN + SN_CLOSED_STATES |
| `api-snowq-service/src/common/enum/request-type.enum.ts` | All 7 SN request types + endpoint mapping |
| `observability-service/src/auth/guards/ed25519.guard.ts` | Verifica Bearer M2M EdDSA en la ingesta de telemetría |
| `servicenow-clone-backend/src/servicenow-simulator/servicenow-simulator.service.ts` | State machine + semantic→numeric state mapping |

## Simulation Scripts

All simulators live in `simulators/` (workspace root). No compilation needed — pure Node.js.
Run from workspace root via npm scripts or directly with `node simulators/<script>.js`.

```bash
# Quick commands (from workspace root)
npm run sim:incident               # queue incident to api-snowq-service
npm run sim:incident:immediate     # immediate (sync) incident
npm run sim:dlq                    # view DLQ
npm run sim:retry-all              # retry all DLQ entries
npm run sim:storm                  # Nagios: 3 hosts down simultaneously
npm run sim:recovery               # Nagios: problem + recovery
npm run sim:dedup                  # Nagios: same alert x3 (dedup test)
npm run sim:full-lifecycle         # combined: full PROBLEM→RECOVERY cycle
npm run sim:cascade                # combined: cascade failure scenario
npm run sim:parallel               # combined: parallel storm load test

# Gateway full flow (requires seeds)
npm run sim:gateway -- incidents --email empleado1@eventcorner.com --password <pwd> --customer-id <uuid>
```

| Script | Env var | Default |
|---|---|---|
| `gateway-simulator.js` | `GATEWAY_URL` | `http://localhost:3000` |
| `snow-request-simulator.js` | `SNOWQ_URL` | `http://localhost:3090` |
| `thruk-simulator.js` | `SNOWQ_URL` | `http://localhost:3090` |
| `combined-simulator.js` | `SNOWQ_URL` | `http://localhost:3090` |

Simulators require M2M auth. Token stored in `simulators/.env`:
```
SNOWQ_M2M_TOKEN=<integration-service JWT>   # natural caller of snowq in production
```

Override URL: `SNOWQ_URL=http://staging:3090 npm run sim:storm`

## Infrastructure Setup (First Time)

```sql
CREATE DATABASE IF NOT EXISTS event_corner     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS incidences_dbase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS servicenow_clone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS abac_db          CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
# Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# MySQL for abac (port 3308)
cd monolito-event-corner_v3
docker-compose -f ../abac-microservice/docker-compose.yml up -d

# MySQL for api-snowq-service
cd api-snowq-service && docker-compose up -d
```
