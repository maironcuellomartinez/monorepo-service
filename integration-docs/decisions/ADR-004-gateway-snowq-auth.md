# ADR-004 — Corrección de autenticación Gateway → api-snowq-service

**Fecha:** 2026-03-15
**Estado:** Aplicado

---

## Contexto

El `ServiceNowOutboundAdapter` del API Gateway tenía implementado un interceptor OAuth2
(`ServiceNowTokenService`) que agregaba `Authorization: Bearer` en cada request hacia
`api-snowq-service`. Esto era incorrecto.

---

## Decisión

**El OAuth2 Client Credentials hacia ServiceNow vive en `api-snowq-service`, no en el gateway.**

El API Gateway es un proxy HTTP plano hacia `api-snowq-service`.
El `api-snowq-service` gestiona internamente su propia autenticación hacia ServiceNow.

---

## Cambios aplicados

- `servicenow-outbound.adapter.ts` — eliminado `OnModuleInit`, `ServiceNowTokenService` e interceptor OAuth2. El adapter ahora es un cliente HTTP simple.
- `servicenow-outbound.module.ts` — eliminado `ServiceNowTokenService` del módulo. Solo requiere `OUTBOUND_GATEWAY_URL`.
- `servicenow-token.service.ts` — quedó huérfano, pendiente de eliminar manualmente.

---

## Cadena de autenticación correcta

```
Monolith ──(x-internal-token header)──► API Gateway
         ──(HTTP sin auth especial)────► api-snowq-service
         ──(OAuth2 Bearer token)────────► ServiceNow
```

## Variables de entorno del gateway (simplificadas)

```env
INTERNAL_API_TOKEN=xxx
OUTBOUND_GATEWAY_URL=http://snowq-host:3090/snow-requests/immediate
```
