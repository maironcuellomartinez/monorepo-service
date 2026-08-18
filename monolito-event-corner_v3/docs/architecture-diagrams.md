# Architecture Diagrams — monolito-event-corner_v3

> Diagramas de componentes y secuencias para entender cómo funciona el sistema Event Corner v3.
> Actualizado 2026-07-31 — remodelado `Incident`+`Request` → `Appointment` unificado (`AppointmentService`, `ServiceNowTicketLink`; ver `docs/documentation.md` y `docs/infrastructure-diagram.md`). Esquemas en texto plano (sin Mermaid) para poder leerlos directo en
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
│  Controllers: Appointments, Corners, Availability, IssueTypes,       │
│    Devices, BatchDrafts, Admin(*), ServiceNowOutbound,               │
│    ExternalRecords                                                   │
│  Proxy HTTP → monolith (/internal/*) con Bearer M2M EdDSA            │
└───────────┬──────────────────────────────────────┬───────────────────┘
            │ Bearer M2M EdDSA                       │ POST /auth/validate-entra
            ▼                                        ▼ POST /abac/can-access, /abac/user-roles
┌────────────────────────────────┐        ┌──────────────────────────────────────┐
│ MONOLITH (Hexagonal)           │        │ ABAC MICROSERVICE :3005              │
│  staging/prod :3001 · dev :3002│        │  AuthService: login M2M/OAuth,       │
│  Core: Appointment, Corner,    │        │    validateEntraToken (JWKS)         │
│    Technician, Device, Locker, │        │  EntraIdService: jwks-rsa + jose     │
│    IssueType, ServiceNowTicket │        │    contra login.microsoftonline.com  │
│    Link                        │        │  AbacService: canAccess(),           │
│  Outbox pattern → eventos      │        │    json-rules-engine                 │
│  MonolithReconcilerJob,        │        │  MySQL: abac_db                      │
│    SnowOrphanRecoveryJob       │        └──────────────────────────────────────┘
│  (SnowSyncJob fue ELIMINADO —  │
│   el monolito cierra el ticket │
│   directo, no polea estado SN) │
│  MySQL: event_corner           │
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
│  IAppointmentService · ICornerService · IAvailabilityService         │
│  IScheduleService · ITechnicianService · IDeviceService              │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Servicios (Use Cases)                                                 │
│  AppointmentService · AvailabilityService · CornerService             │
│  ServiceNowIntegrationService (resolveAssignmentGroup,                │
│    resolveSnowCompanySysId, createTicket, closeTicket, updateTicket)  │
└──────────┬────────────────────────────────────────┬───────────────────┘
           ▼                                        ▼
┌──────────────────────────┐              ┌─────────────────────────────┐
│ Dominio (Core)           │              │ Puertos de salida           │
│  Entities: Appointment,  │              │  IAppointmentRepository     │
│    Corner, Technician,   │              │  IServiceNowTicketLink      │
│    Device, Locker,       │              │    Repository               │
│    IssueType,            │              │  ICornerRepository          │
│    ServiceNowTicketLink  │              │  IServiceNowClient          │
│  Value Objects: Appoint- │              │  ICachePort                 │
│    mentId, Email,        │              └───────────┬─────────────────┘
│    ServiceNowId/Number/  │                          ▼
│    TicketType, DateRange │              ┌───────────────────────────────┐
│  Domain Errors           │              │ Adaptadores (Infrastructure)  │
└──────────────────────────┘              │  TypeORM Repositories         │
                                          │  Redis CacheAdapter           │
                                          │  ServiceNowProxyAdapter       │
                                          │    (monolith → api-gateway    │
                                          │     /outbound/servicenow/*)   │
                                          │  Outbox pattern:              │
                                          │    OutboxWorkerService (5s)   │
                                          │    → OutboxEventBusAdapter    │
                                          │    → AppointmentServiceNow    │
                                          │      Handler (creación),      │
                                          │      AppointmentStatusChanged │
                                          │      Handler (cierre/estado)  │
                                          └───────────┬───────────────────┘
                                                      ▼
                                         ┌──────────────────────────────┐
                                         │ Jobs programados             │
                                         │  MonolithReconcilerJob (30s) │
                                         │  SnowOrphanRecoveryJob(10min)│
                                         │  (SnowSyncJob ELIMINADO —    │
                                         │   ver nota abajo)            │
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
>
> **`SnowSyncJob` fue eliminado** (existía en versiones previas, pollaba el estado en SN cada
> 5 min para auto-cerrar incidencias). Decisión de producto: el monolito **siempre** cierra el
> ticket SN directamente cuando la cita pasa a `CLOSED` (vía `AppointmentStatusChangedHandler`
> → `ServiceNowTicketLink`), nunca al revés — no hace falta pollear SN para saber que algo se
> cerró.

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
      │  GET /api/appointments  Authorization: Bearer <JWT>                       │                  │
      ├───────────────────────────────────────────────────────────────────────►│                  │
      │                                          JwtGuard: sin decorator       │                  │
      │                                          → POST /auth/validate-entra   │                  │
      │                                          (rechaza si type='service'    │                  │
      │                                           no es Entra — ver nota)      │                  │
      │                                                                        │ GET /internal/…  │
      │                                                                        ├─────────────────►│
      │                                                                        │◄─────────────────┤
      │◄───────────────────────────────────────────────────────────────────────┤ 200 [appointments]  │
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
      │  GET /api/appointments  Authorization: Bearer <token Entra ID>
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
      │                          │  GW → MON: GET /internal/appointments (Bearer M2M EdDSA)         │
      │  200 [appointments]         │
      │◄─────────────────────────┤
```

> `AZURE_TENANT_ID`/`AZURE_CLIENT_ID` vacíos en ABAC → `EntraIdService.isEnabled = false` →
> `/auth/validate-entra` responde 503 y no hay fallback salvo el bypass dev (`dev:<base64>`,
> solo si `NODE_ENV=development`). Ver `entra-id.service.ts` y `auth.service.ts:200-207`.

---

## 4d. M2M Token (servicio de infraestructura)

Los servicios de infraestructura (api-gateway, monolith, api-snowq-service, integration-service,
observability-service) **no** intercambian `apiKey`/`apiSecret` en runtime — el JWT M2M de larga
duración se emite **manualmente por un admin, una sola vez**, y se copia al `.env` de cada
servicio como `ABAC_M2M_TOKEN`.

```
Admin                              ABAC :3005                        Servicio Interno
  │                                                                    (ej. monolith)
  │  (una sola vez, setup/rotación)
  │  POST /applications/m2m-service   (@Roles admin)
  │  registra la Application type='m2m_service', SIN apiKey/apiSecret
  ├──────────────────────────►│
  │                            │
  │  POST /applications/:id/issue-token   (@Roles admin)
  ├──────────────────────────►│
  │                            │  JwtEd25519Service.sign(
  │                            │    { sub: applicationId, type:'service',
  │                            │      applicationId, permissions, ownerApplicationId },
  │                            │    ED25519_PRIVATE_KEY, kid: ED25519_KID)
  │  { token }  (se muestra    │
  │   UNA sola vez)            │
  │◄──────────────────────────┤
  │
  │  copia el token al .env del servicio → ABAC_M2M_TOKEN
  ├───────────────────────────────────────────────────────────────►│
  │                                                                  │
  │                                                                  │  usa ABAC_M2M_TOKEN
  │                                                                  │  como Bearer en cada
  │                                                                  │  llamada M2M saliente
```

```
Servicio Interno (ej. monolith)                                    API Gateway :3000
      │
      │  POST /outbound/servicenow/...
      │  Authorization: Bearer <ABAC_M2M_TOKEN>
      ├───────────────────────────────────────────────────────►│
      │                                                        │  JwtGuard: @InternalOnly()
      │                                                        │  Verifica LOCAL con
      │                                                        │  ED25519_PUBLIC_KEY (sin red)
      │                                                        │  request.serviceApp = {...}
      │  200 OK                                                │
      │◄───────────────────────────────────────────────────────┤
```

> `POST /auth/m2m-token` **no existe** (verificado por auditoría 2026-07-09). Los servicios de
> infraestructura usan el flujo de arriba. Distinto es `POST /auth/service-token` — intercambio
> `apiKey`+`apiSecret` → JWT de 1h, pensado para integraciones ad-hoc `type='internal'`, no para
> los servicios de infraestructura del ecosistema. El JWT M2M se firma con **Ed25519 (EdDSA)**,
> no HMAC/`JWT.sign` genérico. Cada servicio consumidor lo verifica localmente con
> `ED25519_PUBLIC_KEY` — sin llamar a ABAC por cada request. Ver `libs/ed25519.service/` y
> `abac-microservice/src/abac/controllers/application.controller.ts`.

---

## 5. Request con guards — JWT + Roles + ABAC (ejemplo con Entra ID)

```
Usuario/Frontend            API Gateway :3000                    ABAC :3005
      │
      │  POST /api/appointments
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
      │                            │  { userId, resource:'appointment', action:'create', context }
      │                            ├──────────────────────────►│
      │                            │                            │  json-rules-engine evalúa
      │                            │◄──────────────────────────┤ { allowed: true/false }
      │       403 si denegado      │
      │◄──────────────────────────┤
      │                            │
      │  ── 4. Controller + Proxy ┤
      │                            │  POST /internal/appointments
      │                            │  Authorization: Bearer <M2M EdDSA JWT>
      │  201 Created { appointment }  │
      │◄──────────────────────────┤
```

---

## 6. Crear una Cita ISSUE (flujo completo, con outbox + ServiceNow)

```
Técnico          API Gateway         Monolith              MySQL      Outbox      snowq/SN
  │
  │ POST /api/appointments
  │ { cornerId, issueTypeId, customerId, slotIds, device }
  ├──────────────►│
  │                │ (Guards: JWT ✓ Roles ✓ ABAC ✓)
  │                │ POST /internal/appointments
  │                │ Authorization: Bearer M2M EdDSA
  │                ├──────────────►│
  │                │                │ AppointmentService.createAppointment()
  │                │                │ SELECT issue_type, corner, slots disponibles
  │                │                ├──────────────►│
  │                │                │◄──────────────┤
  │                │                │ Sin slot → Result.err(SlotNotAvailable)
  │                │  409 Conflict  │
  │◄───────────────┤◄───────────────┤
  │                │                │ Slot OK:
  │                │                │  Crea Appointment (CREATED) + AppointmentSlot + timeline
  │                │                │    + ServiceNowTicketLink(PENDING, role=primary)
  │                │                │  INSERT appointment, appointment_slot,
  │                │                │    appointment_timeline, servicenow_ticket_links
  │                │                │  UPDATE corner_slot (reservado)
  │                │                ├──────────────►│
  │                │                │  Publica evento APPOINTMENT_CREATED → tabla outbox_events
  │                │                ├───────────────────────────►│
  │                │  201 Created   │
  │◄───────────────┤◄───────────────┤ (la creación NO espera al ticket SN — es async)
  │                │                │
  │                │                │                             │ OutboxWorkerService (5s)
  │                │                │                             │ toma el evento pendiente
  │                │                │                             │ → AppointmentServiceNowHandler
  │                │                │                             │ → ServiceNowIntegrationService
  │                │                │                             │   .createTicket()
  │                │                │                             │   resolveAssignmentGroup()
  │                │                │                             │   resolveSnowCompanySysId()
  │                │                │◄────────────────────────────┤
  │                │                │ ServiceNowProxyAdapter → gateway
  │                │◄───────────────┤ POST /outbound/servicenow/incidents/immediate
  │                │  (2 fases: intenta sync, si falla o SN responde deferred, cae a async)
  │                ├───────────────────────────────────────────────────────────►│ snowq
  │                │                │                                            │
  │                │                │  ÉXITO INMEDIATO: sysId+number ────────────┤
  │                │                │  → link.resolveImmediate(sysId, number)     │
  │                │                │  DEFERRED: correlationId ───────────────────┤
  │                │                │  → link.markDeferred(correlationId)         │
  │                │                ├──────────────►│ UPDATE servicenow_ticket_links│
  │                │                │                │                            │
  │                │                │  MonolithReconcilerJob (30s) poll si DEFERRED
  │                │                │  → DELIVERED: link.reconcileDelivered(), limpia correlationId
  │                │                │  → FAILED fatal: limpia correlationId → huérfana
  │                │                │  → FAILED temporal: pide retry a snowq (mismo correlationId)
```

> Si la llamada inicial monolith→snowq falla del todo (no HTTP response), el `OutboxWorkerService`
> reintenta hasta 5 veces (~2.5min de backoff). Si se agotan, la cita queda con su
> `ServiceNowTicketLink` sin `sys_id` ni `correlationId` — la recupera `SnowOrphanRecoveryJob`
> (cada 10min, si `SNOW_ORPHAN_RECOVERY_ENABLED=true`). Ver
> `docs/1. Flujo_de_reconciliación_estado_final.md` y `docs/2.ciclo-incidencia.md` para el
> detalle completo de reintentos y reconciliación.

---

## 7. Máquina de estados de la cita

Fuente de verdad: `apps/monolith/src/core/domain/enums/appointment-status.enum.ts`

```
                                   ┌─────────┐
                  POST /appointments│ CREATED │
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

> No dibujado arriba: `PAUSED` — estado agregado en el remodelado, entra/sale de `IN_PROGRESS`
> igual que los `PENDING_*`. La cadena completa de 13 estados vive en `appointment-status.enum.ts`.

Notas:
- `VALIDATED` y `CANCELED` son los únicos estados **verdaderamente terminales**
  (`TERMINAL_STATUSES`) — sin transición de salida.
- `CLOSED` no tiene salidas por `changeStatus()` genérico: solo se sale vía los métodos
  dedicados `validate()` y `reopen()` de la entidad `Appointment`.
- Al crear (`CREATED`): se reserva el slot en `corner_slots`, se agrega timeline "Cita creada"
  y se publica el evento `APPOINTMENT_CREATED` al outbox (ver diagrama 6) — no hay una
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
  │              │              │  SELECT appointment_slots WHERE slot_id IN(...) (ocupados)
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
      │ { userId, applicationId, resource:'appointment', action:'create',
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

## 11. Mapa de credenciales — qué vive dónde

Verificado contra los `.env.development` reales de cada servicio (2026-07-09).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ abac-microservice — ÚNICO lugar con la clave PRIVADA                        │
│                                                                                │
│   ED25519_PRIVATE_KEY  ─┐                                                    │
│   ED25519_KID           ├─► firma los JWT M2M/OAuth (EdDSA)                  │
│                          │                                                    │
│   ED25519_PUBLIC_KEY  ──┘  (también la tiene, para posible verificación local)│
│                                                                                │
│   AZURE_TENANT_ID   ─┐                                                       │
│   AZURE_CLIENT_ID    ├─► validar tokens Entra ID de USUARIOS (JWKS,          │
│   AZURE_JWKS_URI    ─┘    login.microsoftonline.com) — ver diagrama 4c       │
│                                                                                │
│   MySQL abac_db: Application.apiKey / apiSecret (hash bcrypt)                │
│     → SOLO para type='internal' (POST /auth/service-token) y                │
│       type='oauth_client' (POST /auth/oauth/token, clientId/clientSecret)    │
│     → los servicios de infraestructura (m2m_service) NO tienen apiKey/       │
│       apiSecret — su JWT se emite manual vía POST /applications/:id/         │
│       issue-token (ver diagrama 4d)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │  ED25519_PUBLIC_KEY se distribuye
                                     │  (para verificar M2M localmente,
                                     │  sin llamar a ABAC por request)
                                     ▼
┌────────────────┬────────────────┬────────────────┬────────────────┬────────────────┐
│  api-gateway    │   monolith     │ api-snowq-svc  │ integration-svc│observability-svc│
│                 │                │                │                │                 │
│ ED25519_PUBLIC_ │ED25519_PUBLIC_ │ED25519_PUBLIC_ │ED25519_PUBLIC_ │ED25519_PUBLIC_  │
│ KEY             │KEY             │KEY             │KEY             │KEY              │
│ ABAC_M2M_TOKEN  │ABAC_M2M_TOKEN  │ABAC_M2M_TOKEN  │ABAC_M2M_TOKEN  │ABAC_M2M_TOKEN   │
│ ABAC_APP_ID     │ABAC_APP_ID     │ABAC_APP_ID     │ABAC_APP_ID     │ (sin ABAC_APP_ID)│
│ JWT_ISSUER      │JWT_ISSUER      │                │                │JWT_ISSUER        │
│                 │                │                │                │JWT_AUDIENCE      │
│ ABAC_API_KEY ⚠️ │                │                │                │                 │
│  (solo acá —    │                │                │                │                 │
│   x-api-key     │                │                │                │                 │
│   para /auth/    │                │                │                │                 │
│   validate-entra,│                │                │                │                 │
│   /abac/*)      │                │                │                │                 │
│                 │                │                │AZURE_TENANT_ID │                 │
│                 │                │                │AZURE_CLIENT_ID │                 │
│                 │                │                │AZURE_CLIENT_   │                 │
│                 │                │                │SECRET ⚠️ (Outlook│                 │
│                 │                │                │/MS Graph — NO   │                 │
│                 │                │                │es Entra ID de  │                 │
│                 │                │                │usuarios, es otro│                │
│                 │                │                │app registration)│                │
└────────────────┴────────────────┴────────────────┴────────────────┴────────────────┘
```

Puntos que suelen confundir:

- **`ABAC_API_KEY` solo vive en `api-gateway`.** Es el `x-api-key` que identifica al gateway
  como caller confiable de los endpoints "públicos" de ABAC (`/auth/validate-entra`,
  `/abac/can-access`, `/abac/user-roles`). Ningún otro servicio llama esos endpoints — el resto
  solo usa su `ABAC_M2M_TOKEN` para llamar a otros servicios de infraestructura.
- **`ED25519_PRIVATE_KEY` nunca sale de `abac-microservice`.** Todo lo demás en el ecosistema
  solo tiene la mitad pública (`ED25519_PUBLIC_KEY`), suficiente para *verificar* firmas pero no
  para firmar. Rotar la clave implica: generar nuevo par, propagar la pública nueva a los 5
  servicios, reemitir todos los `ABAC_M2M_TOKEN` — idealmente soportando 2 `kid` en paralelo
  durante la transición.
- **`integration-service` tiene un SEGUNDO par `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`** (más
  `AZURE_CLIENT_SECRET`) que **no tiene nada que ver** con el Entra ID de usuarios finales de
  `abac-microservice`. Es un app registration aparte para Outlook/MS Graph (sync de calendario).
  Confundir estos dos pares es un error fácil — misma forma de variable, propósito totalmente
  distinto.
- **`apiKey`/`apiSecret` de `Application` viven solo en la base de datos de ABAC (hasheados),
  nunca como variable de entorno en un servicio consumidor** — excepto en `simulators/.env`
  (`SNOWQ_M2M_TOKEN`), que guarda un JWT ya emitido, no las credenciales crudas.
- **`api-snowq-service` no tiene `ABAC_API_KEY` ni llama a `/auth/validate-entra`** — solo
  necesita verificar M2M localmente (`ED25519_PUBLIC_KEY`) y, ocasionalmente, llamar a otros
  servicios con su `ABAC_M2M_TOKEN`.

---

## 12. `Symbol(token)` — cómo conecta la arquitectura hexagonal del monolith

El monolith no usa `@Injectable()` + inyección por tipo para sus casos de uso — usa **tokens
`Symbol()`** para desacoplar el puerto (interfaz) de su implementación. Cada `Symbol(...)` es
único en memoria (evita colisiones de nombre) y actúa de "enchufe": el dominio define el enchufe,
la infraestructura provee lo que se enchufa ahí. Verificado contra el código real (2026-07-10).

### Las 4 etapas, con el flujo de `Appointment` como ejemplo real end-to-end

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 1 — DOMINIO (core/ports/*/tokens.ts)                                     │
│ Solo define el Symbol + la interfaz. CERO conocimiento de implementación.      │
│                                                                                │
│   core/ports/tokens.ts:                                                        │
│     export const APPOINTMENT_SERVICE = Symbol('IAppointmentService') ← puerto  │
│                                                                        entrada │
│   core/ports/outgoing/repositories/tokens.ts:                                  │
│     export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY')     │
│                                                              ← puerto salida   │
│   core/ports/outgoing/infrastructure-tokens.ts:                                │
│     export const EVENT_BUS  = Symbol('EVENT_BUS')                              │
│     export const CACHE      = Symbol('CACHE')                                  │
│     export { SERVICENOW_CLIENT } from '@app/shared/contracts/tokens'           │
│                                                                                │
│   Interfaces hermanas (mismo puerto, sin Symbol): IAppointmentService,         │
│   IAppointmentRepository, IServiceNowClient, IEventBus, ICachePort             │
└───────────────────────────────────┬────────────────────────────────────────────┘
                                    │ el Symbol viaja como identidad, no la interfaz
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 2 — INFRAESTRUCTURA: registra el Symbol de SALIDA → clase Adapter        │
│ 3 patrones distintos de binding usados en el código real:                      │
│                                                                                │
│  (a) useClass — typeorm-persistence.module.ts (repositorios TypeORM)           │
│      { provide: APPOINTMENT_REPOSITORY, useClass: TypeOrmAppointmentRepository}│
│                                                                                │
│  (b) useExisting — infrastructure.module.ts (adapters con nombre propio,       │
│      inyectables tanto por su clase como por su token)                         │
│      ServiceNowProxyAdapter,                                                   │
│      { provide: SERVICENOW_CLIENT, useExisting: ServiceNowProxyAdapter }       │
│      OutboxEventBusAdapter,                                                    │
│      { provide: EVENT_BUS, useExisting: OutboxEventBusAdapter }                │
│      LocalCacheAdapter,                                                        │
│      { provide: CACHE, useExisting: LocalCacheAdapter }                        │
│                                                                                │
│  (c) useFactory simple — para adapters sin clase NestJS propia                 │
│     { provide: HOLIDAY_PROVIDER, useFactory: () => new LocalHolidayProvider(…)}│
│                                                                                │
│  Ambos módulos son @Global() → no hace falta reimportarlos en cada módulo      │
│  que consume los tokens de salida.                                             │
└───────────────────────────────────┬────────────────────────────────────────────┘
                                    │ APPOINTMENT_REPOSITORY, EVENT_BUS, CACHE, SERVICENOW_CLIENT
                                    │ ya resuelven a instancias concretas
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 3 — CASOS DE USO: core-services.module.ts compone el Symbol de ENTRADA   │
│ a partir de los Symbols de SALIDA — vía useFactory + inject: [...]             │
│                                                                                │
│  {                                                                             │
│    provide: APPOINTMENT_SERVICE,                                               │
│    useFactory: (appointmentRepo, slotRepo, technicianRepo, cornerRepo,         │
│                  userRepo, companyRepo, issueTypeRepo, eventBus, cache,        │
│                  logger, tracing, deviceService) =>                            │
│        new AppointmentService(appointmentRepo, slotRepo, technicianRepo,       │
│                  cornerRepo, userRepo, companyRepo, issueTypeRepo,             │
│                  eventBus, cache, logger, tracing, deviceService),             │
│    inject: [APPOINTMENT_REPOSITORY, SLOT_REPOSITORY, TECHNICIAN_REPOSITORY,    │
│             CORNER_REPOSITORY, USER_REPOSITORY, COMPANY_REPOSITORY,            │
│             ISSUE_TYPE_REPOSITORY, EVENT_BUS, CACHE, LoggerService,            │
│             TracingService, DEVICE_SERVICE],   ← ¡otro Symbol de ENTRADA!      │
│  }                                                                             │
│                                                                                │
│  `AppointmentService` (la clase) NO tiene `@Injectable()` ni decoradores —     │
│  es una clase de dominio pura, construida a mano con `new` dentro del          │
│  factory. Nest solo resuelve los argumentos del factory por Symbol.            │
│  Nótese que DEVICE_SERVICE (un puerto de ENTRADA) se inyecta como              │
│  dependencia de otro puerto de entrada — los casos de uso se componen          │
│  entre sí, no solo con puertos de salida.                                      │
└───────────────────────────────────┬────────────────────────────────────────────┘
                                    │ APPOINTMENT_SERVICE ya resuelve a una instancia
                                    │ completamente armada de AppointmentService
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ ETAPA 4 — PRESENTACIÓN: internal-api controllers consumen el Symbol con        │
│ @Inject() (necesario porque un Symbol no es un tipo TS inferible)              │
│                                                                                │
│  internal-appointments.controller.ts:                                          │
│    constructor(                                                                │
│      @Inject(APPOINTMENT_SERVICE) private readonly service: IAppointmentService,│
│      @Inject(APPOINTMENT_REPOSITORY) private readonly repository:              │
│                                              IAppointmentRepository,           │
│      private readonly tracing: TracingService,  ← esta SÍ es @Injectable(),    │
│    ) {}                                          no necesita @Inject()         │
│                                                                                │
│  Nota de pureza hexagonal: este controller inyecta el REPOSITORIO              │
│  (puerto de salida) directo, además del servicio (puerto de entrada) —         │
│  salta la capa de caso de uso para algunas operaciones. Es una excepción       │
│  puntual, no el patrón general del resto de los internal-api controllers.      │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Por qué `Symbol()` y no strings o clases

| Alternativa | Problema que evita `Symbol()` |
|---|---|
| String (`'APPOINTMENT_REPOSITORY'`) | Dos módulos podrían definir el mismo string por accidente y colisionar en el contenedor DI |
| Inyección por clase concreta (`TypeOrmAppointmentRepository`) | El caso de uso quedaría acoplado a TypeORM — imposible cambiar de adapter (ej. mock en tests, otro ORM) sin tocar el dominio |
| Interfaz TypeScript como token | Las interfaces no existen en runtime (se borran al compilar) — Nest necesita un valor real para el contenedor DI, por eso el Symbol viaja *junto* a la interfaz, no en su lugar |

### Dónde mirar si algo no resuelve (`Nest can't resolve dependencies`)

1. ¿El Symbol se importa del mismo archivo `tokens.ts` en ambos lados (provider y consumidor)? Dos `Symbol('mismo string')` en archivos distintos son símbolos **distintos** — no colisionan, pero tampoco calzan.
2. ¿El módulo que hace `provide: TOKEN` es `@Global()` o está importado explícitamente donde se consume?
3. ¿El `inject: [...]` del factory tiene el mismo orden que los parámetros del factory? Nest no valida esto en tiempo de compilación — un desorden ahí no tira error de tipos, solo pasa mal los argumentos en runtime.

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
