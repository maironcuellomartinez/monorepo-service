
---

## Flujo del Cliente Registrado → Gateway (Business Logic)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CAPA DE AUTORIZACIÓN (api-middleware-service)                               │
│                                                                              │
│  ┌────────────────┐    ┌────────────────────┐    ┌──────────────────────┐    │
│  │  1. REGISTRO   │    │  2. AUTENTICACIÓN  │    │  3. ACCESO A DATOS   │    │
│  │  POST /clients │    │  POST /oauth/token │    │  GET /v1/requests/*  │    │
│  │                │    │                    │    │                      │    │
│  │  Admin crea    │    │  Client envía      │    │  Client envía JWT    │    │
│  │  el cliente    │    │  client_id +       │    │  en Authorization:   │    │
│  │  (API Key)     │    │  client_secret     │    │  Bearer <token>      │    │
│  │                │    │                    │    │                      │    │
│  │  Devuelve:     │    │  ┌────────────┐    │    │  ┌────────────────┐  │    │
│  │  • clientId    │───→│  │ AuthService│    │    │  │AccessTokenGuard│  │    │
│  │  • clientSecret│    │  │            │    │    │  │                │  │    │
│  │  (única vez)   │    │  │ bcrypt     │    │    │  │ JWT.verify()   │  │    │
│  └────────────────┘    │  │ compare()  │    │    │  │ payload.type   │  │    │
│                        │  └──────┬─────┘    │    │  │ = external_    │  │    │
│                        │         │          │    │  │   client       │  │    │
│                        │         ▼          │    │  └──────┬─────────┘  │    │
│                        │  ┌────────────┐    │    │         │            │    │
│                        │  │ JwtService │    │    │         ▼            │    │
│                        │  │ sign()     │    │    │  ┌───────────────┐   │    │
│                        │  │ payload:   │    │    │  │ RecordsCtrl   │   │    │
│                        │  │ sub=cliend │    │    │  │               │   │    │
│                        │  │ type=ext   │    │    │  │ RecordsSvc    │   │    │
│                        │  │ _client    │    │    │  │               │   │    │
│                        │  └──────┬─────┘    │    │  │ GatewayClient │   │    │
│                        │         │          │    │  │               │   │    │
│                        │         ▼          │    │  │ ┌───────────┐ │   │    │
│                        │  Devuelve JWT      │    │  │ │PQueue HP  │ │   │    │
│                        │  al cliente        │    │  │ │(concur=10)│ │   │    │
│                        └────────────────────┘    │  │ └─────┬─────┘ │   │    │
│                                                  │  │       │       │   │    │
│                                                  │  │ ┌─────▼────┐  │   │    │
│                                                  │  │ │Circuit   │  │   │    │
│                                                  │  │ │Breaker   │  │   │    │
│                                                  │  │ │(opossum) │  │   │    │
│                                                  │  │ └─────┬────┘  │   │    │
│                                                  │  │       │       │   │    │
│                                                  │  │ ┌─────▼────┐  │   │    │
│                                                  │  │ │ HTTP GET │  │   │    │
│                                                  │  │ │ → api-   │  │   │    │
│                                                  │  │ │   gateway│  │   │    │
│                                                  │  │ │ (M2M JWT)│  │   │    │
│                                                  │  │ └──────────┘  │   │    │
│                                                  │  └───────────────┘   │    │
│                                                  └──────────────────────┘    │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐       │
│  │  CAPA DE RESILIENCIA (transversal)                                │       │
│  │                                                                   │       │
│  │  • HttpBulkheadMiddleware → limita concurrencia entrante (PQueue) │       │
│  │  • OAuthBulkheadGuard → max 3 bcrypt simultáneos en /oauth/token  │       │
│  │  • PQueue (HP/LP) → colas salientes hacia api-gateway             │       │
│  │  • Circuit Breaker → opossum, 50% error, 30s reset                │       │
│  └───────────────────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Paso a paso

**1. Registro del cliente** (`POST /clients` — protegido con `x-admin-api-key`)
- Un admin registra la aplicación externa
- Se genera `clientId` (prefijo `mc_`) + `clientSecret` (32 bytes hex)
- El secret se guarda como **bcrypt hash** — solo se muestra una vez
- Se persiste en MySQL (`external_clients`)

**2. Autenticación** (`POST /oauth/token` — protegido con `OAuthBulkheadGuard`)
- El cliente envía `grant_type=client_credentials` + `client_id` + `client_secret`
- **OAuthBulkheadGuard**: limita a **3 bcrypt simultáneos** (máx 5 en cola, timeout 5s). Si se satura → `429 Too Many Requests`
- `AuthService.validateCredentials()`: busca el cliente activo en DB y hace `bcrypt.compare()`
- Si válido → `JwtService.sign()` con payload `{ sub: clientId, type: 'external_client', clientName }`
- Devuelve `{ access_token, token_type: 'Bearer', expires_in, client_name }`

**3. Acceso a datos** (`GET /v1/requests/*` — protegido con `AccessTokenGuard`)
- El cliente envía el JWT en `Authorization: Bearer <token>`
- **AccessTokenGuard**: verifica JWT con `jwt.verify()`, valida que `payload.type === 'external_client'`
- Si válido → inyecta `request.externalClient` con `{ clientId, clientName }`
- `RecordsController` → `RecordsService` → `GatewayClient`
- **GatewayClient**: encola en **PQueue** (HP: concurrencia 10, LP: concurrencia 5), pasa por **Circuit Breaker** (opossum), y hace HTTP GET al **api-gateway interno** usando un **token M2M** (`ABAC_M2M_TOKEN`) en el header `Authorization`

### Puntos clave del diseño

| Aspecto | Detalle |
|---|---|
| **Autenticación** | JWT local firmado con `JWT_SECRET` — no hay OAuth externo |
| **Clientes** | Persistidos en MySQL con bcrypt — no hay sesión ni refresh token |
| **Gateway** | El `GatewayClient` es el único que habla con el api-gateway interno |
| **M2M** | El middleware se autentica ante el api-gateway con un token M2M fijo (`ABAC_M2M_TOKEN`) |
| **Resiliencia** | 3 capas: bulkhead HTTP entrante → bulkhead OAuth → PQueue + Circuit Breaker saliente |

<recap>Expliqué el flujo completo del cliente registrado: 1) Registro vía POST /clients (admin), 2) Autenticación vía POST /oauth/token (JWT local con bcrypt), 3) Acceso a datos vía GET /v1/requests/* (AccessTokenGuard → RecordsService → GatewayClient → api-gateway interno con M2M token). El siguiente paso sugerido es revisar si el diseño actual satisface los requisitos de seguridad y escalabilidad esperados.</recap>