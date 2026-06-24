# ADR-001 — Roles de servicios y routing ServiceNow

**Fecha:** 2026-03-15
**Estado:** Aceptado

---

## Contexto

El legacy `api-support-corner` integraba ServiceNow a través de un proxy (`api-servicenow`).
En el nuevo ecosistema existen múltiples servicios. Había que decidir dónde vive la lógica
de routing (qué grupo resolutor, qué categoría) y quién llama a ServiceNow.

Además, el `api-snowq-service` cumple el rol del legacy `api-servicenow` pero con
capacidades adicionales (queue, circuit breaker, retry, DLQ, Nagios/Thruk).

---

## Decisión

**El monolith es el único que resuelve lógica de negocio para ServiceNow.**
**El `api-snowq-service` es transporte puro — no conoce el dominio.**

### Routing de ServiceNow vive en el monolith:

| Dato SN | Origen |
|---------|--------|
| `assignment_group` | `CornerIssueConfig(cornerId, issueTypeId)` → fallback `corner.snow_assignment_group` |
| `category` | `IssueType.servicenow_category` |
| `caller_id` | `user.principalName` (UPN) |
| `correlation_id` | `device.serialNumber` |
| `company` | `ServiceNowProfile.snowCompanySysId` (via `company.profileId`) |
| `location` | `corner.servicenow_location` |

### Cadena de llamadas:
```
Monolith ──(x-internal-token)──► API Gateway /outbound/servicenow/incidents
         ──(HTTP plano)─────────► api-snowq-service /snow-requests/immediate/incidents
         ──(OAuth2 Bearer)───────► ServiceNow
```

La autenticación OAuth2 vive en `api-snowq-service`, no en el API Gateway.
El API Gateway es un proxy HTTP plano hacia snowq.

---

## Consecuencias

- `CornerIssueConfig` (equivalente a `placesissuetypes` del legacy) **necesita persistencia** en el monolith ✅ implementado
- `servicenow_group_requests` del legacy (lista blanca de grupos adicionales) → **pendiente** en el nuevo sistema
- El `api-snowq-service` no recibe ni necesita contexto de negocio — solo campos SN estándar
