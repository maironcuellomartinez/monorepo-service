# Architecture Diagrams — monolito-event-corner_v3

> Diagramas de componentes y secuencias para entender cómo funciona el sistema Event Corner v3.
> Actualizado 2026-07-09. Esquemas en texto plano (sin Mermaid) para poder leerlos directo en
> el editor o en `cat`/`less` sin renderizador.

---

## 1. Vista general del ecosistema

```
Customer App / event-corner-app (cliente real de Entra ID — hace login contra Azure AD)
    │ HTTP  Authorization: Bearer <token Entra ID>
    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ API GATEWAY  (staging/prod :3000 · dev :4000)                        │
│  Guards globales (orden): JwtGuard → RolesGuard → AbacGuard          │
│  Controllers: Incidents, Corners, Availability, IssueTypes,          │
│    Requests, Devices, Admin(*), ServiceNowOutbound, ExternalRecords  │
│  Proxy HTTP → monolith (/internal/*) con Bearer M2M EdDSA            │
└───────────┬──────────────────────────────────────┬───────────────────┘
            │ Bearer M2M EdDSA                       │ POST /auth/validate-entra
            ▼                                        ▼ POST /abac/can-access, /abac/user-roles
┌────────────────────────────────┐        ┌──────────────────────────────────────┐
│ MONOLITH (Hexagonal)           │        │ ABAC MICROSERVICE :3005              │
│  staging/prod :3001 · dev :3002│        │  AuthService: login M2M/OAuth,       │
│  Core: Incident, Corner,       │        │    validateEntraToken (JWKS)         │
│    Technician, Device, Locker, │        │  EntraIdService: jwks-rsa + jose     │
│    Request, IssueType          │        │    contra login.microsoftonline.com  │
│  Outbox pattern → eventos      │        │  AbacService: canAccess(),           │
│  ReconcilerJob, SnowSyncJob,   │        │    json-rules-engine                 │
│    SnowOrphanRecoveryJob       │        │  MySQL: abac_db                      │
│  MySQL: event_corner           │        └──────────────────────────────────────┘
└───────────┬────────────────────┘
            │ Bearer M2M EdDSA → {API_GATEWAY_URL}/outbound/servicenow/*
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ API GATEWAY — ServiceNowOutboundController (único egress a SN)       │
│  Create (2 fases): POST /snow-requests/immediate/{tipo}  (sync)      │
│                    POST /snow-requests/{tipo}            (async)     │
│  Update / Close / Reconcile                                          │
└───────────┬──────────────────────────────────────────────────────────┘
            │ Bearer M2M EdDSA
            ▼
┌────────────────────────────────┐
│ API-SNOWQ-SERVICE :3090        │
│  Cola priorizada (PQueue,      │
│    concurrency=5) + backoff    │
│    exponencial por prioridad   │
│  Circuit breaker (opossum)     │
└───────────┬────────────────────┘
            │ Basic Auth
            ▼
┌────────────────────────────────┐
│ servicenow-clone-backend :3010 │  (dev)  /  ServiceNow real (staging/prod)
└────────────────────────────────┘

integration-service :3008 → api-gateway / monolith (M2M) — Minerva SOAP, DropPoint, Outlook
  (NO maneja ServiceNow — ver egress arriba)

────────────────────────────────────────────────────────────────────────
TODOS los servicios → observability-service :3099
  POST /ingest/{logs,metrics,traces}, Bearer M2M EdDSA
  Reenvía opcionalmente a Jaeger / Prometheus Pushgateway
```

---

## 2. API Gateway — pipeline de guards (detalle)

```
HTTP Request
Authorization: Bearer <token>
    │
    ▼
┌────────────────────────────────────────────────────────────────────┐
│ 1. JwtGuard  (único guard de autenticación — jwt.guard.ts)         │
│    ─────────────────────────────────────────────────────           │
│    @Public()        → pasa directo                                 │
│    @InternalOnly()  → validación LOCAL Ed25519 (M2M)               │
│                        JwtEd25519Service.verifyWithKey(            │
│                          ED25519_PUBLIC_KEY, token,                │
│                          { iss: JWT_ISSUER })                      │
│                        Exige payload.type === 'service'            │
│                        Chequea ownerApplicationId vs ABAC_APP_ID   │
│                          (ecosystem scoping)                       │
│                        → request.serviceApp = {...}                │
│    (sin decorator)  → delega 100% a ABAC                           │
│                        POST /auth/validate-entra { token, appId }  │
│                        → request.user = { sub, email, permissions }│
└───────────────────────────────┬────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│ 2. RolesGuard  (roles.guard.ts)                                    │
│    Sin @Roles() en el endpoint → pasa                              │
│    Con @Roles('TECHNICIAN', ...) → GET user roles                  │
│      Cache en memoria (Map in-process, TTL 60s) — NO es Redis      │
│      Cache miss → AbacClient.getUserRoles(userId)                  │
│      Sin rol requerido → 403 Forbidden                             │
└───────────────────────────────┬────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. AbacGuard  (abac.guard.ts)                                     │
│    Sin @Permission() en el endpoint → pasa (solo exige auth)       │
│    Con @Permission(resource, action) →                             │
│      AbacClient.canAccess(userId, resource, action, context)       │
│      context = { ip, userAgent, path, method }                     │
│      Denegado → 403 Forbidden                                      │
└───────────────────────────────┬────────────────────────────────────┘
                                ▼
                         Controller (thin proxy)
                                 │
                                 ▼
                   MonolithClient → HTTP /internal/*
                   Authorization: Bearer <M2M EdDSA JWT>
```

---

## 3. Monolith — Arquitectura Hexagonal

```
┌─────────────────────────────────────────────────────────────────────┐
│ Internal API Controllers (solo para API Gateway, prefijo /internal) │
└────────────────────────────────┬────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Puertos de entrada (Incoming Ports)                                  │
│  IIncidentService · ICornerService · IAvailabilityService            │
│  IRequestService · IScheduleService · ITechnicianService             │
│  IDeviceService                                                      │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Servicios (Use Cases)                                                 │
│  IncidentService · AvailabilityService · CornerService                │
│  ServiceNowIntegrationService (resolveAssignmentGroup,                │
│    resolveSnowCompanySysId, createIncidentTicket, closeIncidentTicket)│
└──────────┬────────────────────────────────────────┬───────────────────┘
           ▼                                        ▼
┌──────────────────────────┐              ┌─────────────────────────────┐
│ Dominio (Core)           │              │ Puertos de salida           │
│  Entities: Incident,     │              │  IIncidentRepository        │
│    Corner, Technician,   │              │  ICornerRepository          │
│    Device, Locker,       │              │  IServiceNowClient          │
│    Request, IssueType    │              │  ICachePort                 │
│  Value Objects: Incident │              └───────────┬─────────────────┘
│    Id, Email, ServiceNow │                          ▼
│    Id/Number, DateRange  │              ┌───────────────────────────────┐
│  Domain Errors           │              │ Adaptadores (Infrastructure)  │
└──────────────────────────┘              │  TypeORM Repositories         │
                                          │  Redis CacheAdapter           │
                                          │  ServiceNowProxyAdapter       │
                                          │    (monolith → api-gateway    │
                                          │     /outbound/servicenow/*)   │
                                          │  Outbox pattern:              │
                                          │    OutboxWorkerService (5s)   │
                                          │    → OutboxEventBusAdapter    │
                                          │    → IncidentServiceNowHandler│
                                          └───────────┬───────────────────┘
                                                      ▼
                                         ┌──────────────────────────────┐
                                         │ Jobs programados             │
                                         │  MonolithReconcilerJob (30s) │
                                         │  SnowSyncJob (5min)          │
                                         │  SnowOrphanRecoveryJob(10min)│
                                         └──────────────────────────────┘
                                         ┌──────────────────────────────┐
                                         │ Persistencia                 │
                                         │  MySQL: event_corner         │
                                         │  Redis: availability cache   │
                                         └──────────────────────────────┘
```

> Nota: no hay un `EventBus` síncrono llamando directo a ServiceNow. La creación de tickets
> pasa por el patrón Outbox (evento persistido en `outbox_events`, procesado async por
> `OutboxWorkerService`) y de ahí a `api-gateway → api-snowq-service → SN`. Ver diagrama 6.

---

## 4a. Login por contraseña — NO DISPONIBLE

> **Requerimiento del cliente:** los usuarios finales se autentican exclusivamente con
> **Entra ID / Azure AD**. No hay `POST /api/auth/login` expuesto en el gateway.
> Ver diagrama 4c para el flujo real.

---

## 4b. OAuth 2.0 Client Credentials (app externa)

```
App Externa (client_id/secret)              ABAC :3005                  Gateway :3000        Monolith
      │                                          │                             │                  │
      │  POST /auth/oauth/token                  │                             │                  │
      │  { grant_type: 'client_credentials',     │                             │                  │
      │    client_id, client_secret, scope }     │                             │                  │
      ├─────────────────────────────────────────►│  (endpoint público)         │                  │
      │                                          │  SELECT application         │                  │
      │                                          │    WHERE apiKey=client_id   │                  │
      │                                          │  bcrypt.compare(secret,     │                  │
      │                                          │    apiSecret hash)          │                  │
      │                                          │                             │                  │
      │        401 invalid_client (cred inválida)│                             │                  │
      │◄─────────────────────────────────────────┤                             │                  │
      │       400 invalid_scope (scope no permitido)                           │                  │
      │◄─────────────────────────────────────────┤                             │                  │
      │        200 OK →                          │                             │                  │
      │  SELECT permissions WHERE userId=ownerId │                             │                  │
      │  scope final = permisos ∩ scopes pedidos │                             │                  │
      │  JWT.sign EdDSA { sub, type:'service',   │                             │                  │
      │    permissions, scope, applicationId }   │                             │                  │
      │  { access_token, token_type:'Bearer',    │                             │                  │
      │    expires_in, scope }                   │                             │                  │
      │◄─────────────────────────────────────────┤                             │                  │
      │                                                                        │                  │
      │  GET /api/incidents  Authorization: Bearer <JWT>                       │                  │
      ├───────────────────────────────────────────────────────────────────────►│                  │
      │                                          JwtGuard: sin decorator       │                  │
      │                                          → POST /auth/validate-entra   │                  │
      │                                          (rechaza si type='service'    │                  │
      │                                           no es Entra — ver nota)      │                  │
      │                                                                        │ GET /internal/…  │
      │                                                                        ├─────────────────►│
      │                                                                        │◄─────────────────┤
      │◄───────────────────────────────────────────────────────────────────────┤ 200 [incidents]  │
```

> Nota: hoy `JwtGuard` delega **todo** token sin `@InternalOnly()` a `/auth/validate-entra`
> (pensado para tokens Entra ID). Verificar en el código de ABAC si ese endpoint también
> acepta JWT OAuth Client Credentials, o si las apps externas necesitan una ruta distinta —
> este punto no quedó 100% confirmado durante la última revisión y conviene chequearlo antes
> de confiar en el flujo tal como está dibujado.

---

## 4c. Entra ID / Azure AD (flujo real)

```
event-corner-app                 API Gateway :3000        ABAC :3005                Azure AD (JWKS)
(cliente real de Entra ID)
      │  Login MSAL contra Azure AD (fuera de este diagrama)
      │  obtiene un token con iss=login.microsoftonline.com/{tenant}/v2.0
      │
      │  GET /api/incidents  Authorization: Bearer <token Entra ID>
      ├─────────────────────────►│
      │                          │  JwtGuard: sin decorator → delega a ABAC
      │                          │  POST /auth/validate-entra
      │                          │  { token, applicationId }  x-api-key: <gateway key>
      │                          ├──────────────────────────► │
      │                          │                            │  EntraIdService.validate(token)
      │                          │                            │  jwt.decode → header.kid
      │                          │                            │  jwksClient.getSigningKey(kid)
      │                          │                            ├───────────────────────────────►│
      │                          │                            │  GET {tenant}/discovery/v2.0/keys
      │                          │                            │◄───────────────────────────────┤
      │                          │                            │  JWKS (cache 10min)
      │                          │                            │  jose.importJWK(n,e) → SPKI PEM │
      │                          │                            │  jwt.verify(token, publicKey,   │
      │                          │                            │    { audience: AZURE_CLIENT_ID, │
      │                          │                            │      issuer, algorithms:RS256 })│
      │                          │                            │
      │                          │                            │  SELECT user WHERE entraId=oid  │
      │                          │                            │  No existe → lazy sync (INSERT) │
      │                          │ { valid:true, userId,      │
      │                          │  oid, email, permissions } │
      │                          │◄───────────────────────────┤
      │                          │  request.user = { sub, email, permissions, tokenType:'entra' }│
      │                          │  RolesGuard / AbacGuard evalúan sobre ese user                │
      │                          │  GW → MON: GET /internal/incidents (Bearer M2M EdDSA)         │
      │  200 [incidents]         │
      │◄─────────────────────────┤
```

> `AZURE_TENANT_ID`/`AZURE_CLIENT_ID` vacíos en ABAC → `EntraIdService.isEnabled = false` →
> `/auth/validate-entra` responde 503 y no hay fallback salvo el bypass dev (`dev:<base64>`,
> solo si `NODE_ENV=development`). Ver `entra-id.service.ts` y `auth.service.ts:200-207`.

---

## 4d. M2M Token (servicio interno)

```
Servicio Interno (ej. monolith)         ABAC :3005                 API Gateway :3000
      │
      │  POST /auth/m2m-token
      │  { apiKey, apiSecret }
      ├───────────────────────────►│
      │                            │  SELECT application + owner + permissions
      │                            │  bcrypt.compare + expiración + usageLimit
      │                            │  JwtEd25519Service.sign(
      │                            │    { sub, type:'service', applicationId,
      │                            │      permissions, ownerApplicationId },
      │                            │    ED25519_PRIVATE_KEY, kid: ED25519_KID)
      │  { accessToken, tokenType: │
      │    'Bearer', expiresIn,    │
      │    permissions }           │
      │◄───────────────────────────┤
      │
      │  POST /outbound/servicenow/...
      │  Authorization: Bearer <JWT EdDSA>
      ├───────────────────────────────────────────────────────►│
      │                                                        │  JwtGuard: @InternalOnly()
      │                                                        │  Verifica LOCAL con
      │                                                        │  ED25519_PUBLIC_KEY (sin red)
      │                                                        │  request.serviceApp = {...}
      │  200 OK                                                │
      │◄───────────────────────────────────────────────────────┤
```

> El JWT M2M se firma con **Ed25519 (EdDSA)**, no con HMAC/`JWT.sign` genérico. Cada servicio
> consumidor lo verifica localmente con `ED25519_PUBLIC_KEY` — sin llamar a ABAC por cada
> request. Ver `libs/ed25519.service/`.

---

## 5. Request con guards — JWT + Roles + ABAC (ejemplo con Entra ID)

```
Usuario/Frontend            API Gateway :3000                    ABAC :3005
      │
      │  POST /api/incidents
      │  Authorization: Bearer <token Entra ID>
      ├──────────────────────────►│
      │                            │
      │  ── 1. JwtGuard ──────────┤
      │                            │  POST /auth/validate-entra
      │                            ├──────────────────────────►│
      │                            │◄──────────────────────────┤ { valid, userId, permissions }
      │                            │  request.user = {...}     │
      │       401 si inválido      │
      │◄──────────────────────────┤ (corta acá si no válido)
      │                            │
      │  ── 2. RolesGuard ────────┤  (solo si el endpoint tiene @Roles(...))
      │                            │  cache en memoria (TTL 60s)
      │                            │  miss → GET user-roles
      │                            ├──────────────────────────►│
      │                            │◄──────────────────────────┤
      │       403 si rol insuf.    │
      │◄──────────────────────────┤
      │                            │
      │  ── 3. AbacGuard ─────────┤  (solo si el endpoint tiene @Permission(resource, action))
      │                            │  POST /abac/can-access
      │                            │  { userId, resource:'incident', action:'create', context }
      │                            ├──────────────────────────►│
      │                            │                            │  json-rules-engine evalúa
      │                            │◄──────────────────────────┤ { allowed: true/false }
      │       403 si denegado      │
      │◄──────────────────────────┤
      │                            │
      │  ── 4. Controller + Proxy ┤
      │                            │  POST /internal/incidents
      │                            │  Authorization: Bearer <M2M EdDSA JWT>
      │  201 Created { incident }  │
      │◄──────────────────────────┤
```

---

## 6. Crear un Incidente (flujo completo, con outbox + ServiceNow)

```
Técnico          API Gateway         Monolith              MySQL      Outbox      snowq/SN
  │
  │ POST /api/incidents
  │ { cornerId, issueTypeId, customerId, deviceId, scheduledDate }
  ├──────────────►│
  │                │ (Guards: JWT ✓ Roles ✓ ABAC ✓)
  │                │ POST /internal/incidents
  │                │ Authorization: Bearer M2M EdDSA
  │                ├──────────────►│
  │                │                │ IncidentService.createIncident()
  │                │                │ SELECT issue_type, corner, slots disponibles
  │                │                ├──────────────►│
  │                │                │◄──────────────┤
  │                │                │ Sin slot → Result.err(SlotNotAvailable)
  │                │  409 Conflict  │
  │◄───────────────┤◄───────────────┤
  │                │                │ Slot OK:
  │                │                │  Crea Incident (CREATED) + IncidentSlot + timeline
  │                │                │  INSERT incident, incident_slot, incident_timeline
  │                │                │  UPDATE corner_slot (reservado)
  │                │                ├──────────────►│
  │                │                │  Publica evento IncidentCreated → tabla outbox_events
  │                │                ├───────────────────────────►│
  │                │  201 Created   │
  │◄───────────────┤◄───────────────┤ (la creación NO espera al ticket SN — es async)
  │                │                │
  │                │                │                             │ OutboxWorkerService (5s)
  │                │                │                             │ toma el evento pendiente
  │                │                │                             │ → IncidentServiceNowHandler
  │                │                │                             │ → ServiceNowIntegrationService
  │                │                │                             │   .createIncidentTicket()
  │                │                │                             │   resolveAssignmentGroup()
  │                │                │                             │   resolveSnowCompanySysId()
  │                │                │◄────────────────────────────┤
  │                │                │ ServiceNowProxyAdapter → gateway
  │                │◄───────────────┤ POST /outbound/servicenow/incidents/immediate
  │                │  (2 fases: intenta sync, si falla o SN responde deferred, cae a async)
  │                ├───────────────────────────────────────────────────────────►│ snowq
  │                │                │                                            │
  │                │                │  ÉXITO INMEDIATO: sysId+number ────────────┤
  │                │                │  → incident.updateServiceNowInfo()          │
  │                │                │  DEFERRED: correlationId ───────────────────┤
  │                │                │  → incident.setSnowqCorrelationId()         │
  │                │                ├──────────────►│ UPDATE incident              │
  │                │                │                │                            │
  │                │                │  MonolithReconcilerJob (30s) poll si DEFERRED
  │                │                │  → DELIVERED: guarda sysId+number, limpia correlationId
  │                │                │  → FAILED fatal: limpia correlationId → huérfana
  │                │                │  → FAILED temporal: pide retry a snowq (mismo correlationId)
```

> Si la llamada inicial monolith→snowq falla del todo (no HTTP response), el `OutboxWorkerService`
> reintenta hasta 5 veces (~2.5min de backoff). Si se agotan, la incidencia queda sin
> `servicenow_id` ni `correlationId` — la recupera `SnowOrphanRecoveryJob` (cada 10min, si
> `SNOW_ORPHAN_RECOVERY_ENABLED=true`). Ver `docs/1. Flujo_de_reconciliación_estado_final.md`
> y `docs/2.ciclo-incidencia.md` para el detalle completo de reintentos y reconciliación.

---

## 7. Máquina de estados del incidente

Fuente de verdad: `apps/monolith/src/core/domain/enums/incident-status.enum.ts`

```
                                   ┌─────────┐
                    POST /incidents│ CREATED │
                    (técnico crea) └────┬────┘
                                        │ dispositivo entregado
                                        ▼
                                  ┌───────────┐
                                  │ DELIVERED │
                                  └─────┬─────┘
                                        │ técnico toma
                                        ▼
                                 ┌─────────────┐
                        ┌───────►│ IN_PROGRESS │◄───────┐
                        │        └──────┬──────┘        │
                        │               │                │
          (retoma)      │      ┌────────┼────────┐       │ (retoma)
                        │      ▼        ▼        ▼       │
              ┌──────────────┐ ┌──────────┐ ┌──────────────────┐
              │PENDING_THIRD_│ │PENDING_  │ │PENDING_SPARE_PART│
              │PARTY         │ │USER      │ │                  │
              └──────┬───────┘ └────┬─────┘ └────────┬─────────┘
                     └───────────────┴────────────────┘
                                     │ (todas vuelven a IN_PROGRESS)
                                     ▼
                         (desde IN_PROGRESS, dispositivo listo)
                    ┌────────────────┴─────────────────┐
                    ▼                                   ▼
           ┌─────────────────┐              ┌───────────────────────────┐
           │ PENDING_PICKUP   │              │PENDING_REPLACEMENT_DELIVERY│
           └────────┬─────────┘              └──────────────┬─────────────┘
                    └───────────────────┬───────────────────┘
                                        ▼
                                   ┌────────┐
                                   │ CLOSED │
                                   └───┬────┘
                             ┌─────────┴─────────┐
                    validate()│                   │reopen()
                              ▼                   ▼
                       ┌───────────┐        ┌──────────┐
                       │ VALIDATED │        │ REOPENED │──► vuelve a IN_PROGRESS
                       └───────────┘        └──────────┘
                        (terminal)

  CREATED también puede ir directo a CANCELED (cliente cancela) — terminal, sin retorno.
```

Notas:
- `VALIDATED` y `CANCELED` son los únicos estados **verdaderamente terminales**
  (`TERMINAL_STATUSES`) — sin transición de salida.
- `CLOSED` no tiene salidas por `changeStatus()` genérico: solo se sale vía los métodos
  dedicados `validate()` y `reopen()` de la entidad `Incident`.
- Al crear (`CREATED`): se reserva el slot en `corner_slots`, se agrega timeline "Incidente
  creado" y se publica el evento `IncidentCreated` al outbox (ver diagrama 6) — no hay una
  llamada síncrona a ServiceNow en el mismo request.

---

## 8. Verificar disponibilidad de slots

```
Frontend         API Gateway            Monolith                Redis        MySQL
  │
  │ GET /api/availability/slots?cornerIds=1,2&date=2025-06-15
  ├────────────►│
  │              │ (Guards: JWT ✓)
  │              │ GET /internal/availability/slots?...
  │              ├────────────►│
  │              │              │ AvailabilityService.getAvailableSlots()
  │              │              │ GET availability:1,2:2025-06-15
  │              │              ├────────────►│
  │              │              │              │
  │              │              │  Cache HIT (TTL 60s) ──┐
  │              │              │◄────────────┤          │
  │              │  200 [slots] │                        │
  │◄─────────────┤◄─────────────┤◄───────────────────────┘
  │              │              │
  │              │              │  Cache MISS:
  │              │              │  SELECT corner_schedules WHERE corner_id IN(1,2) AND day_of_week=?
  │              │              ├──────────────────────────────────────────────►│
  │              │              │◄──────────────────────────────────────────────┤
  │              │              │  SELECT corner_slots WHERE corner_id IN(1,2) AND date=?
  │              │              ├──────────────────────────────────────────────►│
  │              │              │◄──────────────────────────────────────────────┤
  │              │              │  SELECT incident_slots WHERE slot_id IN(...) (ocupados)
  │              │              ├──────────────────────────────────────────────►│
  │              │              │◄──────────────────────────────────────────────┤
  │              │              │  slots_libres = todos_los_slots - reservados
  │              │              │  SET availability:1,2:2025-06-15 TTL 60s
  │              │              ├────────────►│
  │              │  200 [slots] │
  │◄─────────────┤◄─────────────┤
```

---

## 9. Evaluación ABAC (permisos)

```
API Gateway (AbacGuard)              ABAC :3005                    MySQL abac_db
      │
      │ POST /abac/can-access
      │ { userId, applicationId, resource:'incident', action:'create',
      │   context:{ hour, ip, path, method } }
      ├─────────────────────────►│
      │                           │ AbacService.canAccess()
      │                           │ pipeline: validateUserApplication
      │                           │        → getUserPermissions
      │                           │        → evaluatePolicies (json-rules-engine)
      │                           │
      │                           │ SELECT roles/policies WHERE user_id=? AND app_id=?
      │                           ├──────────────────────────►│
      │                           │◄──────────────────────────┤ [Role/Policy permissions]
      │                           │
      │                           │ Role permissions: deny gana sobre allow
      │                           │ Si hay Policy con conditions → evalúa con json-rules-engine
      │                           │   facts = { user, application, membership, context }
      │                           │   resultado: allow | deny | null
      │                           │   null (sin política que matchee) → allow si hay permiso
      │                           │
      │  { allowed: true }        │
      │◄─────────────────────────┤
      │  { allowed: false, reason }
      │◄─────────────────────────┤
      │  → AbacGuard lanza ForbiddenException
```

---

## 10. Observabilidad — `@app/observability` (compartido por todos los servicios)

```
┌──────────────────────────────────────────────────────────────────┐
│ Cualquier servicio (gateway, monolith, abac, snowq, integration…)  │
│                                                                      │
│  Incoming Request                                                   │
│      │                                                               │
│      ▼                                                               │
│  CorrelationMiddleware ── genera/extrae X-Correlation-ID             │
│      │                    inyecta en AsyncLocalStorage                │
│      ▼                                                               │
│  PerformanceInterceptor ── mide tiempo de respuesta                  │
│      │                                                               │
│      ▼                                                               │
│  AllExceptionsFilter ── captura excepciones, formato estándar        │
│      │                                                               │
│      ▼                                                               │
│  LoggerService (Winston) ── logs JSON estructurados + correlationId  │
│      │                                                               │
│      ▼                                                               │
│  winston-http transport (circuit breaker @backendkit-labs)           │
└──────────────────────────────┬───────────────────────────────────┘
                                 │ POST /ingest/logs   (Bearer M2M EdDSA)
                                 │ POST /ingest/metrics
                                 │ POST /ingest/traces
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ OBSERVABILITY-SERVICE :3099  (sink central de telemetría)          │
│  Ed25519Guard valida el Bearer M2M                                  │
│  Reenvío opcional:                                                  │
│    → Jaeger        (JAEGER_OTLP_URL, si está configurado)           │
│    → Prometheus     (PROMETHEUS_PUSHGATEWAY_URL, si está configurado)│
└──────────────────────────────┬───────────────────────────────────┘
                                 ▼
                    observability-dashboard (Vite)
                    — visualización de logs/métricas/trazas
```

> Los servicios **no** hablan directo con Prometheus/Jaeger — todo pasa primero por
> `observability-service`, que reenvía opcionalmente si esas variables están configuradas.

---

## Resumen de Puertos y Tecnologías

| Servicio | Puerto (staging/prod · dev) | Base de Datos | Responsabilidad |
|----------|------------------------------|----------------|-----------------|
| API Gateway | :3000 · :4000 | — (sin DB propia) | Proxy público, autenticación, guards, egress ServiceNow |
| Monolith | :3001 · :3002 | MySQL `event_corner` | Lógica de negocio, dominio, persistencia |
| ABAC Microservice | :3005 | MySQL `abac_db` | Autenticación, autorización, políticas |
| api-snowq-service | :3090 | MySQL (snow_requests) | Cola + circuit breaker hacia ServiceNow |
| integration-service | :3008 | — | Minerva SOAP, DropPoint, Outlook (CQRS + Event Sourcing) |
| observability-service | :3099 | — | Sink de logs/métricas/trazas |
| servicenow-clone-backend | :3010 | MySQL `servicenow_clone` | Mock local de ServiceNow (dev) |

| Tecnología | Uso |
|------------|-----|
| NestJS 11 | Framework base de todos los servicios |
| TypeORM | ORM para MySQL (Monolith, ABAC, snowq) |
| MySQL 8 | Persistencia principal |
| Redis | Cache de disponibilidad (Monolith) |
| Ed25519 (EdDSA) | Firma/verificación de tokens M2M — `@app/ed25519` |
| jwks-rsa + jose | Validación de tokens Azure AD (JWKS) — en ABAC |
| json-rules-engine | Evaluación de políticas ABAC |
| Winston | Logging estructurado, transporte HTTP a observability-service |
| @backendkit-labs/circuit-breaker | Resiliencia en gateway/monolith/observability transports |
| opossum | Circuit breaker en api-snowq-service |
| PM2 | Process manager (dev/staging) |
| Axios | HTTP client entre servicios |
| OAuth 2.0 RFC 6749 | Client Credentials flow para apps externas |

### Modos de autenticación soportados

| Modo | Endpoint de obtención | Quién lo usa | Firma |
|---|---|---|---|
| **Entra ID (Azure AD)** ⭐ | Login MSAL contra Azure (fuera de este repo) | Todos los usuarios finales — cliente real: `event-corner-app` | RS256, verificado en ABAC vía JWKS |
| M2M (servicio) | `POST /auth/m2m-token` | Servicios internos (gateway↔monolith↔snowq↔integration↔observability) | Ed25519 (EdDSA) |
| OAuth Client Credentials | `POST /auth/oauth/token` | Apps externas con client_id/secret + scopes | Ed25519 (EdDSA) |

> ⭐ **Requerimiento del cliente:** los usuarios finales solo pueden autenticarse con Entra ID.
> No hay login por email/contraseña en esta versión. `abac-microservice` **no** es cliente de
> Azure AD — solo verifica tokens vía JWKS. Ver `entra-id.service.ts`.

Todos los modos producen un `userId`/`serviceApp` que fluye por el pipeline de guards
(`JwtGuard` → `RolesGuard` → `AbacGuard`) sin transformación adicional.
