# Arquitectura General

## Principio fundamental

Cada servicio tiene un único rol. El monolito es el único que toma decisiones de negocio.
Los servicios proxy/infraestructura no conocen el dominio.

---

## Diagrama de capas

```
┌──────────────────────────────────────────────────────────────┐
│                     CLIENTES                                 │
│         (App iOS, Web, gateway-simulator.js)                 │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────────┐
│                    API GATEWAY :3000                         │
│  - Auth (JWT/ABAC)                                           │
│  - Validación DTOs (ValidationPipe whitelist:true)           │
│  - Proxy hacia monolith (internal HTTP)                      │
│  - Outbound: /outbound/servicenow/* → api-snowq-service      │
└──────────┬───────────────────────────────────────────────────┘
           │ HTTP interno (x-internal-token)
┌──────────▼───────────────────────────────────────────────────┐
│                    MONOLITH :3001                            │
│  - Dominio de negocio (DDD, hexagonal)                       │
│  - Corners, Incidentes, Usuarios, Dispositivos               │
│  - Resuelve: assignment_group, category, caller_id           │
│  - Llama al API Gateway para outbound SN                     │
└──────────┬───────────────────────────────────────────────────┘
           │ POST /outbound/servicenow/incidents
┌──────────▼───────────────────────────────────────────────────┐
│                  API GATEWAY (outbound)                      │
│  - Recibe del monolith, reenvía a snowq                      │
│  - HTTP directo hacia api-snowq-service                      │
└──────────┬───────────────────────────────────────────────────┘
           │ POST /snow-requests/immediate/incidents
┌──────────▼───────────────────────────────────────────────────┐
│               api-snowq-service :3090                        │
│  - Cola controlada (concurrency: 5, PQueue)                  │
│  - Circuit breaker (opossum), retry con backoff              │
│  - Deduplicación (SHA-256 fingerprint)                       │
│  - DLQ (FAILED status + /failed endpoints)                   │
│  - Receptor Nagios/Thruk → /monitoring/alerts                │
│  - OAuth2 Client Credentials hacia ServiceNow                │
└──────────┬───────────────────────────────────────────────────┘
           │ OAuth2 Bearer Token
┌──────────▼────────────────┐
│       ServiceNow           │
└────────────────────────────┘

Nagios/Thruk → POST /monitoring/alerts → api-snowq-service → ServiceNow
```

---

## Responsabilidades por capa

### Monolith (dominio)
- Resuelve qué `assignment_group` usar (ver sección [Resolución de assignment_group](#resolución-de-assignment_group))
- Resuelve qué `category` usar: `IssueType.servicenow_category`
- Identifica al usuario: `user.principalName` (UPN) como `caller_id`
- Identifica el dispositivo: `device.serialNumber` como `correlation_id`
- NO llama directamente a ServiceNow — siempre pasa por el gateway

### API Gateway (entrada + egress)
- Única puerta de entrada para clientes externos
- Proxy hacia monolith para operaciones de negocio
- Proxy de salida hacia `api-snowq-service` para operaciones ServiceNow (HTTP directo)
- NO gestiona autenticación hacia ServiceNow — eso es responsabilidad del snowq-service

### api-snowq-service (transporte)
- NO conoce corners, issueTypes, usuarios ni dispositivos
- Recibe payloads ya resueltos y los entrega a ServiceNow de forma controlada
- Gestiona resiliencia: throttling, retry, circuit breaker, DLQ
- También procesa alertas de monitoreo de Nagios/Thruk
- **Gestiona OAuth2 Client Credentials** hacia ServiceNow (token propio, renovación automática)

---

## Resolución de assignment_group

`ServiceNowIntegrationService.resolveAssignmentGroup()` sigue esta cadena de prioridad:

```
1. CompanyIssueConfig(company.id, issueTypeId)      ← más específico
2. CompanyIssueConfig(SN_DEFAULT_COMPANY_ID, issueTypeId)  ← fallback por tipo de incidencia
3. Corner.snow_assignment_group                       ← fallback por corner
4. 'SOPORTE_GENERAL' + warn en log                   ← sin configuración disponible
```

**Paso 2** requiere que exista la variable de entorno `SN_DEFAULT_COMPANY_ID` apuntando
al `company_id` interno de la compañía "default/corporate" en el monolith.
Esta compañía debe tener `CompanyIssueConfig` completo para todos los `issue_type` activos.

Ver [ADR-005](./decisions/ADR-005-default-company-group-fallback.md) para la decisión.

---

## Resolución de company en ServiceNow

`ServiceNowIntegrationService.resolveSnowCompanySysId()`:

```
1. Company.profileId → ServiceNowProfile.snow_company_sys_id
2. fallback: SN_DEFAULT_COMPANY_SYS_ID (env var)
3. null (ticket sin company — ServiceNow lo acepta)
```

`SN_DEFAULT_COMPANY_SYS_ID` y `SN_DEFAULT_COMPANY_ID` son conceptualmente distintos:
- `SN_DEFAULT_COMPANY_SYS_ID` → `sys_id` en **ServiceNow** (campo `company` del ticket)
- `SN_DEFAULT_COMPANY_ID` → `company_id` interno en **el monolith** (para buscar `CompanyIssueConfig`)
