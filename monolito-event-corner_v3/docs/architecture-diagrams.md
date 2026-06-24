# Architecture Diagrams — monolito-event-corner_v3

> Diagramas de componentes y secuencias para entender cómo funciona el sistema Event Corner v3.

---

## 1. Diagrama de Componentes — Vista General

```mermaid
graph TB
    subgraph CLIENTS["Clientes"]
        WEB["Web Browser / Frontend"]
    end

    subgraph GATEWAY["API Gateway :3000"]
        direction TB
        GW_CTRL["Controllers (thin proxies)\n─────────────────\nAuthController\nIncidentsController\nCornersController\nAvailabilityController\nIssueTypesController\nRequestsController\nServiceNowOutboundController\nInventoryOutboundController"]
        GW_GUARDS["Guards (Chain)\n─────────────────\n1. JwtGuard (multi-mode)\n2. RolesGuard\n3. AbacGuard"]
        GW_CLIENTS["Clients\n─────────────────\nMonolithClient\nAbacClient (+ validateEntraToken)"]
        GW_ENTRA["EntraIdService (Gateway)\n─────────────────\nisEntraIdToken() only\n(local decode, no network)"]
        GW_CTRL --> GW_GUARDS --> GW_CLIENTS
        GW_GUARDS --> GW_ENTRA
    end

    subgraph MONOLITH["Monolith :3001 (Hexagonal)"]
        direction TB
        subgraph CORE["Core Domain"]
            ENTITIES["Entities\n─────────────\nIncident\nCorner\nTechnician\nDevice\nLocker\nRequest\nIssueType\nCornerSchedule"]
            SERVICES["Services (Use Cases)\n─────────────\nIncidentService\nCornerService\nAvailabilityService\nRequestService\nScheduleService\nTechnicianService\nDeviceService"]
            PORTS["Ports (Interfaces)\n─────────────\nIIncidentService\nICornerService\nIAvailabilityService\nIIncidentRepository\n..."]
            SERVICES -->|implements| PORTS
        end
        subgraph INFRA["Infrastructure"]
            REPOS["TypeORM Repositories\n─────────────\nIncidentRepository\nCornerRepository\n..."]
            CACHE["Cache Adapter\n(Redis)"]
            EVENTBUS["SimpleEventBus\n(Domain Events)"]
            HANDLERS["EventHandlers\n─────────────\nIncidentEventsHandler"]
            JOBS["Scheduled Jobs\n─────────────\nDeviceSyncJob\nMonolithReconcilerJob"]
            SN_CLIENT["ServiceNowClient"]
            INV_ADAPTER["InventoryAdapter"]
        end
        INTERNAL_API["Internal API Controllers\n(only for API Gateway)\n─────────────────────\n/internal/incidents\n/internal/corners\n/internal/availability\n/internal/requests\n/internal/devices"]
        INTERNAL_API --> SERVICES
        SERVICES --> REPOS
        SERVICES --> CACHE
        SERVICES --> EVENTBUS
        EVENTBUS --> HANDLERS
        HANDLERS --> SN_CLIENT
    end

    subgraph ABAC["ABAC Microservice :3005"]
        direction TB
        AUTH_SVC["AuthService\n─────────────\nLogin / Password\nM2M Token\nOAuth Client Credentials\nEntra ID validate + sync\nRefresh / Logout"]
        ENTRA_SVC["EntraIdService (ABAC)\n─────────────\nJWKS validation\n(jwks-rsa + Azure)\nlazy sync oid→userId"]
        ABAC_SVC["AbacService\n─────────────\nPolicy evaluation\njson-rules-engine"]
        ABAC_DB[("MySQL\nevent_corner_abac\n─────────────\nUsers / Roles\nPolicies / Permissions\nApplications\n (type, scopes, entraObjectId)")]
        AUTH_SVC --> ABAC_DB
        AUTH_SVC --> ENTRA_SVC
        ABAC_SVC --> ABAC_DB
    end

    subgraph SHARED_LIBS["Shared Libraries"]
        OBS["@app/observability\n─────────────\nLoggerService (Winston)\nCorrelationMiddleware\nPerformanceInterceptor\nAllExceptionsFilter\nMetricsProducerService"]
        SHARED["@app/shared\n─────────────\nResult<T,E>\nBranded IDs\nDomainError\nresult-to-http\nDateRange, Evidence"]
    end

    subgraph EXTERNAL["Sistemas Externos"]
        MYSQL[("MySQL :3306\nevent_corner\n─────────────\nincidents\ncorners\ntechnicians\ndevices\nlockers\ncorner_slots\nrequests")]
        REDIS[("Redis\n─────────────\nAvailability cache\nRoles cache")]
        SERVICENOW["ServiceNow\n(ITSM external)"]
        INVENTORY["Inventory API\n(external devices)"]
    end

    WEB -->|"Bearer JWT\nHTTP/HTTPS"| GATEWAY
    GW_CLIENTS -->|"POST /abac/can-access\nx-api-key"| ABAC
    GW_CLIENTS -->|"HTTP /internal/*\nx-internal-token"| MONOLITH
    REPOS --> MYSQL
    CACHE --> REDIS
    SN_CLIENT --> SERVICENOW
    INV_ADAPTER --> INVENTORY
    JOBS --> MYSQL

    GATEWAY -.->|uses| SHARED_LIBS
    MONOLITH -.->|uses| SHARED_LIBS
    ABAC -.->|uses| SHARED_LIBS
```

---

## 2. Diagrama de Componentes — API Gateway en detalle

```mermaid
graph LR
    subgraph REQUEST["Request Pipeline (API Gateway)"]
        direction TB
        A["HTTP Request\nAuthorization: Bearer ..."] --> B

        subgraph GUARDS_CHAIN["Guards Chain (en orden)"]
            B["JwtGuard (multi-mode)\n────────────\nExtrae Bearer token\n① isEntraIdToken() → ABAC validate-entra\n② isAbacToken()    → local JWT verify\n③ @IsInternal()    → M2M service JWT\nInyecta request.user / serviceApp"]
            C["RolesGuard\n────────────\nLee @Roles(...) del endpoint\nConsulta roles en ABAC\nCache 60s en Redis\nDeniega si rol insuficiente"]
            D["AbacGuard\n────────────\nLee @Permission(resource, action)\nLlama AbacClient.canAccess()\nPasa contexto: hora, IP, etc.\nDeniega si política rechaza"]
        end

        B --> C --> D

        E["Controller\n(thin proxy)\nExtrae params\nLlama MonolithClient"]
        F["MonolithClient\n────────────\nHTTP POST/GET/PATCH\nAgrega Bearer M2M JWT\nReenvía body/params\nDevuelve response"]

        D --> E --> F
    end

    F -->|"HTTP /internal/..."| MON["Monolith"]
    D -->|"POST /abac/can-access"| ABAC["ABAC Microservice"]
    B -->|"POST /auth/validate-entra\n(Entra ID path)"| ABAC
```

---

## 3. Diagrama de Componentes — Monolith (Arquitectura Hexagonal)

```mermaid
graph TB
    subgraph HEXAGONAL["Monolith — Arquitectura Hexagonal"]

        subgraph INCOMING["Puertos de Entrada (Incoming Ports)"]
            P_INC["IIncidentService"]
            P_COR["ICornerService"]
            P_AVA["IAvailabilityService"]
            P_REQ["IRequestService"]
            P_SCH["IScheduleService"]
            P_TEC["ITechnicianService"]
            P_DEV["IDeviceService"]
        end

        subgraph DOMAIN["Dominio (Core)"]
            direction TB
            ENT["Entities\n──────────\nIncident\nCorner\nTechnician\nDevice\nLocker\nRequest\nIssueType"]
            ENUM["Enums\n──────────\nIncidentStatus\nDeviceStatus\nLockerStatus\nDayOfWeek"]
            VO["Value Objects\n──────────\nIncidentId\nEmail\nSerialNumber\nSlotWindow\nDateRange"]
            ERR["Domain Errors\n──────────\nDomainError (base)\nIncidentNotFound\nSlotNotAvailable\n..."]
        end

        subgraph SERVICES_IMPL["Implementaciones (Use Cases)"]
            S_INC["IncidentService\n──────────\ncreateIncident()\ntakeIncident()\nupdateStatus()\ngetTimeline()"]
            S_AVA["AvailabilityService\n──────────\ngetAvailableSlots()\ncalculateWindowSlots()"]
            S_COR["CornerService\n──────────\ncreateCorner()\nassignTechnician()"]
        end

        subgraph OUTGOING["Puertos de Salida (Outgoing Ports)"]
            R_INC["IIncidentRepository"]
            R_COR["ICornerRepository"]
            R_AVA["IAvailabilityRepository"]
            R_SLO["ISlotRepository"]
            EBUS["IEventBus"]
            ICACHE["ICachePort"]
        end

        subgraph ADAPTERS["Adaptadores (Infrastructure)"]
            direction TB
            ORM_INC["TypeORM\nIncidentRepository"]
            ORM_COR["TypeORM\nCornerRepository"]
            REDIS_ADP["Redis\nCacheAdapter"]
            EVTBUS["SimpleEventBus"]
            SN_CLI["ServiceNowClient"]
            INV_ADP["InventoryAdapter"]
        end

        subgraph DB["Persistencia"]
            MYSQL_DB[("MySQL\nevent_corner")]
            REDIS_DB[("Redis")]
        end

        INCOMING --> SERVICES_IMPL
        SERVICES_IMPL --> DOMAIN
        SERVICES_IMPL --> OUTGOING
        OUTGOING --> ADAPTERS
        ORM_INC --> MYSQL_DB
        ORM_COR --> MYSQL_DB
        REDIS_ADP --> REDIS_DB
        EVTBUS -->|"domainEvent"| SN_CLI
    end

    INT_API["Internal API\nControllers"] --> INCOMING
```

---

## 4. ~~Diagrama de Secuencia — Login por contraseña~~ (NO DISPONIBLE)

> **Requerimiento del cliente:** los usuarios finales deben autenticarse exclusivamente con **Entra ID / Azure AD**.
> El flujo de login por email/contraseña (`POST /api/auth/login`) **no está expuesto** en el gateway en esta versión.
> Ver sección 4c para el flujo Entra ID.

---

## 4b. Diagrama de Secuencia — OAuth 2.0 Client Credentials (app externa)

```mermaid
sequenceDiagram
    actor App as App Externa (client_id/secret)
    participant ABAC as ABAC Microservice :3005
    participant DB_ABAC as MySQL (event_corner_abac)
    participant GW as API Gateway :3000
    participant MON as Monolith :3001

    Note over App,ABAC: Fase 1 — Obtener access_token

    App->>ABAC: POST /auth/oauth/token<br/>{ grant_type: 'client_credentials',<br/>  client_id: 'ak_xxx',<br/>  client_secret: '...', scope: 'incidents:read' }

    Note over ABAC: Endpoint público (no ApiKeyGuard)

    ABAC->>DB_ABAC: SELECT application WHERE apiKey = client_id
    DB_ABAC-->>ABAC: Application { type, scopes, ownerId }
    ABAC->>ABAC: bcrypt.compare(client_secret, apiSecret hash)

    alt Credenciales inválidas o type ≠ 'oauth_client'
        ABAC-->>App: 401 { error: 'invalid_client' }
    else Scope no permitido
        ABAC-->>App: 400 { error: 'invalid_scope' }
    else OK
        ABAC->>DB_ABAC: SELECT permissions WHERE userId = ownerId
        ABAC->>ABAC: Intersectar permisos ∩ requestedScopes
        ABAC->>ABAC: JWT.sign({ sub: userId, type:'service',<br/>  permissions, scope, applicationId })
        ABAC-->>App: { access_token, token_type:'Bearer',<br/>  expires_in: 3600, scope: 'incidents:read' }
    end

    Note over App,MON: Fase 2 — Usar el token

    App->>GW: GET /api/incidents<br/>Authorization: Bearer eyJ... (OAuth JWT)
    Note over GW: JwtGuard: no es Entra → validateAbacToken()<br/>verifica firma local JWT_SECRET
    GW->>GW: request.user = { sub: userId, permissions, tokenType:'abac' }
    Note over GW: AbacGuard: canAccess(userId, 'incident', 'read')
    GW->>MON: GET /internal/incidents
    MON-->>GW: [incidents]
    GW-->>App: 200 [incidents]
```

---

## 4c. Diagrama de Secuencia — Entra ID / Azure AD

```mermaid
sequenceDiagram
    actor User as Usuario (token Azure AD)
    participant GW as API Gateway :3000
    participant ABAC as ABAC Microservice :3005
    participant AZURE as Azure AD (JWKS)
    participant DB_ABAC as MySQL (event_corner_abac)
    participant MON as Monolith :3001

    Note over User,GW: El usuario ya tiene un token de Microsoft (MSAL, etc.)

    User->>GW: GET /api/incidents<br/>Authorization: Bearer eyJ...(Microsoft issuer)

    Note over GW: JwtGuard: isEntraIdToken() = true<br/>(jwt.decode → iss.includes('login.microsoftonline.com'))

    GW->>ABAC: POST /auth/validate-entra<br/>{ token, applicationId }<br/>x-api-key: <gateway key>

    Note over ABAC: ApiKeyGuard → AuthService.validateEntraToken()

    ABAC->>AZURE: GET /.well-known/openid-configuration<br/>→ jwks_uri (cached 10 min)
    AZURE-->>ABAC: JWKS public keys
    ABAC->>ABAC: jwt.verify(token, signingKey)<br/>Verifica firma + exp + aud + iss

    alt Token inválido o expirado
        ABAC-->>GW: 401 { valid: false }
        GW-->>User: 401 Unauthorized
    else Token válido
        ABAC->>DB_ABAC: SELECT user WHERE entraOid = payload.oid
        alt Usuario no existe (primer login)
            ABAC->>DB_ABAC: INSERT user (email, entraOid, role=employee)
            Note over ABAC: Lazy sync automático
        end
        DB_ABAC-->>ABAC: User { id, permissions }
        ABAC-->>GW: { valid:true, userId, oid, email, permissions }
    end

    GW->>GW: request.user = { sub: userId, email,<br/>  permissions, tokenType:'entra', oid }
    Note over GW: AbacGuard: canAccess(userId, 'incident', 'read')
    GW->>MON: GET /internal/incidents
    MON-->>GW: [incidents]
    GW-->>User: 200 [incidents]
```

---

## 4d. Diagrama de Secuencia — M2M Token (servicio interno)

```mermaid
sequenceDiagram
    actor SVC as Servicio Interno (M2M)
    participant ABAC as ABAC Microservice :3005
    participant DB_ABAC as MySQL (event_corner_abac)
    participant GW as API Gateway :3000
    participant MON as Monolith :3001

    Note over SVC,ABAC: Fase 1 — Obtener JWT M2M (rotar cada ~180 días)

    SVC->>ABAC: POST /auth/m2m-token<br/>{ apiKey: 'ak_xxx', apiSecret: '...' }
    ABAC->>DB_ABAC: SELECT application + owner + permissions
    ABAC->>ABAC: bcrypt.compare + expiración + usageLimit
    ABAC->>ABAC: JWT.sign({ sub: userId, type:'service',<br/>  applicationId, permissions, accountType:'service' })
    ABAC-->>SVC: { accessToken, tokenType:'Bearer',<br/>  expiresIn: 3600, permissions }

    Note over SVC,MON: Fase 2 — Llamada a un endpoint @IsInternal()

    SVC->>GW: POST /outbound/servicenow/...<br/>Authorization: Bearer eyJ... (M2M JWT)
    Note over GW: JwtGuard: @IsInternal() → validateInternalToken()<br/>verifica type='service' en payload
    GW->>GW: request.serviceApp = { applicationId, applicationName }
    GW->>MON: (proxy o lógica interna)
    MON-->>GW: response
    GW-->>SVC: 200 OK
```

---

## 5. Diagrama de Secuencia — Request con Guards (JWT + Roles + ABAC)

```mermaid
sequenceDiagram
    actor User as Usuario/Frontend
    participant GW as API Gateway :3000
    participant ABAC as ABAC Microservice :3005
    participant Redis as Redis Cache
    participant MON as Monolith :3001

    User->>GW: POST /api/incidents<br/>Authorization: Bearer <jwt><br/>{ body... }

    Note over GW: Guard Chain ejecutada en orden

    rect rgb(240, 248, 255)
        Note over GW: 1. JwtGuard
        GW->>GW: Extraer token del header
        GW->>GW: JWT.verify(token, JWT_SECRET)
        alt Token inválido o expirado
            GW-->>User: 401 Unauthorized
        else Token válido
            GW->>GW: inject request.user = { sub, roles, ... }
        end
    end

    rect rgb(255, 248, 220)
        Note over GW: 2. RolesGuard
        GW->>GW: Leer @Roles('TECHNICIAN') del endpoint
        GW->>Redis: GET roles:{userId}
        alt Cache hit
            Redis-->>GW: [roles array]
        else Cache miss
            GW->>ABAC: GET /abac/user-roles?userId=&appId=
            ABAC-->>GW: [roles array]
            GW->>Redis: SET roles:{userId} TTL 60s
        end
        alt Rol insuficiente
            GW-->>User: 403 Forbidden
        end
    end

    rect rgb(240, 255, 240)
        Note over GW: 3. AbacGuard
        GW->>GW: Leer @Permission('incident', 'create')
        GW->>ABAC: POST /abac/can-access<br/>{ userId, appId, resource: 'incident',<br/>  action: 'create', context: { hour, ip } }
        ABAC->>ABAC: Evaluar políticas con json-rules-engine
        ABAC-->>GW: { allowed: true/false }
        alt Permiso denegado
            GW-->>User: 403 Forbidden
        end
    end

    rect rgb(255, 240, 245)
        Note over GW: 4. Controller + Proxy
        GW->>MON: POST /internal/incidents<br/>x-internal-token: <secret><br/>{ body... }
        MON->>MON: Ejecutar lógica de negocio
        MON-->>GW: { incident data }
        GW-->>User: 201 Created { incident }
    end
```

---

## 6. Diagrama de Secuencia — Crear un Incidente (flujo completo)

```mermaid
sequenceDiagram
    actor Tech as Técnico
    participant GW as API Gateway :3000
    participant MON as Monolith :3001
    participant DB as MySQL (event_corner)
    participant Redis as Redis
    participant EVTBUS as EventBus
    participant SN as ServiceNow

    Tech->>GW: POST /api/incidents<br/>{ cornerId, issueTypeId, customerId,<br/>  deviceId, scheduledDate }

    Note over GW: Guards: JWT ✓ Roles ✓ ABAC ✓

    GW->>MON: POST /internal/incidents<br/>x-internal-token: <secret>

    Note over MON: IncidentService.createIncident()

    MON->>DB: SELECT issue_type WHERE id = ?
    DB-->>MON: IssueType record

    MON->>DB: SELECT corner WHERE id = ?
    DB-->>MON: Corner record

    MON->>DB: SELECT available slots WHERE<br/>corner_id = ? AND date = ?
    DB-->>MON: Available slots list

    alt No hay slots disponibles
        MON-->>GW: Result.err(SlotNotAvailable)
        GW-->>Tech: 409 Conflict "No hay slots disponibles"
    else Slot disponible
        MON->>MON: Crear Incident entity (estado: CREATED)
        MON->>MON: Crear IncidentSlot (reserva el slot)
        MON->>MON: Crear timeline entry "Incidente creado"

        MON->>DB: INSERT incident
        MON->>DB: INSERT incident_slot
        MON->>DB: INSERT incident_timeline
        MON->>DB: UPDATE corner_slot (reservado)

        MON->>EVTBUS: emit IncidentCreated(incident)

        Note over EVTBUS: Async - no bloquea response

        EVTBUS->>SN: POST /servicenow/incident<br/>(si está configurado)
        SN-->>EVTBUS: 200 OK (sys_id)
        EVTBUS->>DB: UPDATE incident SET servicenow_id = ?

        MON->>Redis: DEL availability:{cornerId}:{date}

        MON-->>GW: Result.ok(IncidentDTO)
        GW-->>Tech: 201 Created { incident }
    end
```

---

## 7. Diagrama de Secuencia — Máquina de Estados del Incidente

```mermaid
stateDiagram-v2
    [*] --> CREATED : POST /incidents\n(técnico crea)

    CREATED --> IN_PROGRESS : PATCH /id/take\n(técnico toma el incidente)

    IN_PROGRESS --> PENDING_PICKUP : PATCH /id/release\n(técnico libera temporalmente)
    PENDING_PICKUP --> IN_PROGRESS : PATCH /id/take\n(técnico retoma)

    IN_PROGRESS --> PENDING_DELIVERY : PATCH /id/ready\n(dispositivo reparado)
    PENDING_DELIVERY --> DELIVERED : PATCH /id/deliver\n(entregado al cliente)

    DELIVERED --> CLOSED : PATCH /id/close\n(cierre auto o manual)
    DELIVERED --> REOPENED : PATCH /id/reopen\n(cliente insatisfecho)

    REOPENED --> IN_PROGRESS : PATCH /id/take\n(técnico re-interviene)

    CLOSED --> VALIDATED : PATCH /id/validate\n(cliente confirma)
    VALIDATED --> [*]

    note right of CREATED
        Slot reservado en corner_slots
        Timeline: "Incidente creado"
        Evento: IncidentCreated → ServiceNow
    end note

    note right of IN_PROGRESS
        technician_id asignado
        Timeline: "Tomado por técnico X"
    end note

    note right of DELIVERED
        Locker liberado (si aplica)
        Timeline: "Entregado al cliente"
    end note
```

---

## 8. Diagrama de Secuencia — Verificar Disponibilidad de Slots

```mermaid
sequenceDiagram
    actor Client as Frontend
    participant GW as API Gateway :3000
    participant MON as Monolith :3001
    participant Redis as Redis Cache
    participant DB as MySQL

    Client->>GW: GET /api/availability/slots<br/>?cornerIds=1,2&date=2025-06-15

    Note over GW: Guards: JWT ✓

    GW->>MON: GET /internal/availability/slots<br/>?cornerIds=1,2&date=2025-06-15

    Note over MON: AvailabilityService.getAvailableSlots()

    MON->>Redis: GET availability:1,2:2025-06-15
    alt Cache hit (TTL 60s)
        Redis-->>MON: [slots JSON]
        MON-->>GW: [slots]
        GW-->>Client: 200 OK [available slots]
    else Cache miss
        MON->>DB: SELECT corner_schedules WHERE<br/>corner_id IN (1,2) AND day_of_week = ?
        DB-->>MON: Schedules con horarios

        MON->>DB: SELECT corner_slots WHERE<br/>corner_id IN (1,2) AND date = ?
        DB-->>MON: Todos los slots del día

        MON->>DB: SELECT incident_slots WHERE<br/>slot_id IN (...) (slots ocupados)
        DB-->>MON: Slots reservados

        MON->>MON: Calcular slots libres =\ntodos_slots - slots_reservados

        MON->>Redis: SET availability:1,2:2025-06-15<br/>TTL: 60s

        MON-->>GW: [available slots]
        GW-->>Client: 200 OK [available slots]
    end
```

---

## 9. Diagrama de Secuencia — Evaluación ABAC (Permisos)

```mermaid
sequenceDiagram
    participant GW as API Gateway (AbacGuard)
    participant ABAC as ABAC Microservice :3005
    participant DB_ABAC as MySQL (event_corner_abac)
    participant ENGINE as json-rules-engine

    GW->>ABAC: POST /abac/can-access<br/>{ userId, applicationId,<br/>  resource: "incident",<br/>  action: "create",<br/>  context: { hour: 14, ip: "...",<br/>  location: "AR", mfaVerified: true } }

    Note over ABAC: AbacService.canAccess()

    ABAC->>DB_ABAC: SELECT policies WHERE<br/>user_id = ? AND app_id = ?<br/>(via roles y assignments)
    DB_ABAC-->>ABAC: [Policy1, Policy2, ...]

    loop Para cada política
        ABAC->>ENGINE: evaluate(policy.rules, context)
        Note over ENGINE: Evalúa condiciones:<br/>{ "all": [<br/>  { "fact": "hour", "operator": "greaterThan", "value": 8 },<br/>  { "fact": "mfaVerified", "operator": "equal", "value": true }<br/>] }
        ENGINE-->>ABAC: { result: true/false }

        alt Política matchea (result: true)
            ABAC->>DB_ABAC: SELECT permissions WHERE<br/>policy_id = ? AND resource = ? AND action = ?
            DB_ABAC-->>ABAC: Permission { effect: ALLOW/DENY, priority: N }
        end
    end

    ABAC->>ABAC: Resolver conflictos por prioridad<br/>DENY sobre ALLOW si misma prioridad

    alt Permiso concedido
        ABAC-->>GW: { allowed: true }
    else Permiso denegado
        ABAC-->>GW: { allowed: false, reason: "..." }
        GW-->>GW: throw ForbiddenException
    end
```

---

## 10. Diagrama de Componentes — Observabilidad

```mermaid
graph LR
    subgraph REQUESTS["Requests"]
        REQ["Incoming Request"]
    end

    subgraph OBS["@app/observability (aplicado a los 3 servicios)"]
        direction TB
        MW["CorrelationMiddleware\n──────────────\nGenera/extrae X-Correlation-ID\nInyecta en AsyncLocalStorage"]
        INT1["CorrelationInterceptor\n──────────────\nAgrega X-Correlation-ID\nen response headers"]
        INT2["PerformanceInterceptor\n──────────────\nMide tiempo de respuesta\nRegistra en métricas"]
        FILTER["AllExceptionsFilter\n──────────────\nCaptura todas las exceptions\nFormato estándar de error\nLog con correlationId"]
        LOGGER["LoggerService (Winston)\n──────────────\nLogs estructurados JSON\nNiveles: error/warn/info/debug\nIncluye correlationId"]
        METRICS["MetricsProducerService\n──────────────\nPrometheus counters/gauges\nExpose /metrics endpoint"]
        TRACER["TelemetryService\n──────────────\nOpenTelemetry spans\nDistributed tracing"]
        DECORATOR["@Tracking()\n──────────────\nDecorador para métodos\nCrea spans automáticos"]
    end

    subgraph OUTPUTS["Outputs"]
        LOGS_OUT["Logs (stdout/file)\nJSON estructurado"]
        PROM["Prometheus\n/metrics"]
        OTEL["OpenTelemetry\nCollector"]
    end

    REQ --> MW --> INT1 --> INT2 --> FILTER
    MW -.-> LOGGER
    INT2 -.-> METRICS
    FILTER -.-> LOGGER
    LOGGER --> LOGS_OUT
    METRICS --> PROM
    TRACER --> OTEL
    DECORATOR -.-> TRACER
```

---

## Resumen de Puertos y Tecnologías

| Servicio | Puerto | Base de Datos | Responsabilidad |
|----------|--------|---------------|-----------------|
| API Gateway | :3000 | — (sin DB propia) | Proxy público, autenticación, guards |
| Monolith | :3001 | MySQL `event_corner` | Lógica de negocio, dominio, persistencia |
| ABAC Microservice | :3005 | MySQL `event_corner_abac` | Autenticación, autorización, políticas |

| Tecnología | Uso |
|------------|-----|
| NestJS 11 | Framework base de los 3 servicios |
| TypeORM | ORM para MySQL en Monolith y ABAC |
| MySQL 8 | Persistencia principal (2 bases) |
| Redis | Cache de disponibilidad y roles (TTL 60s) |
| JWT + bcrypt | Autenticación de usuarios y M2M |
| json-rules-engine | Evaluación de políticas ABAC |
| Winston | Logging estructurado |
| Prometheus | Métricas de rendimiento |
| OpenTelemetry | Distributed tracing |
| PM2 | Process manager en producción |
| Axios | HTTP client entre servicios |
| jwks-rsa | Validación de tokens Azure AD (JWKS) — en abac-microservice |
| OAuth 2.0 RFC 6749 | Client Credentials flow para apps externas |

### Modos de autenticación soportados

| Modo | Endpoint de obtención | Quién lo usa | token `type` en JWT |
|---|---|---|---|
| **Entra ID (Azure AD)** ⭐ | Token obtenido de Microsoft (MSAL) | Todos los usuarios finales | — (validado en ABAC via JWKS) |
| M2M (servicio) | `POST /auth/m2m-token` | Servicios internos con apiKey/apiSecret | `'service'` |
| OAuth Client Credentials | `POST /auth/oauth/token` | Apps externas con client_id/secret + scopes | `'service'` |

> ⭐ **Requerimiento del cliente:** los usuarios finales solo pueden autenticarse con Entra ID. No hay login por email/contraseña en esta versión.

Todos los modos producen un `userId` que fluye sin cambios por el pipeline ABAC (`canAccess()`).

### Nuevos endpoints ABAC (desde 2026-03-27)

| Endpoint | Auth | Propósito |
|---|---|---|
| `POST /auth/oauth/token` | público (client_id/secret en body) | OAuth 2.0 Client Credentials |
| `POST /auth/validate-entra` | ApiKeyGuard | Validar token Azure AD + lazy sync |
| `POST /applications/oauth` | admin | Crear OAuth client app |
| `POST /applications/:id/rotate-secret` | admin | Rotar client_secret de OAuth app |
