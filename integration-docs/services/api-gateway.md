# API Gateway — monolito-event-corner_v3

> Actualizado 2026-07-31 — reemplaza referencias a `Incident`/`x-internal-token`, ambos
> superados: `Incident`/`Request` se unificaron en `Appointment` (remodelado 2026-07), y
> `x-internal-token` fue reemplazado por JWT M2M Ed25519/EdDSA (Fase 5, 2026-07-16).

**Puerto:** 3000 (staging/prod) · 4000 (dev, `API_GATEWAY_PORT`)
**Path:** `workspace-santander/monolito-event-corner_v3/apps/api-gateway`
**Swagger:** `/docs`

---

## Rol

Único punto de entrada para clientes externos.
- Autentica: Entra ID (usuarios, vía ABAC/JWKS) + M2M Ed25519 (servicios internos) + OAuth2 Client Credentials (apps externas)
- Guards en cadena: `JwtGuard` → `RolesGuard` → `AbacGuard`
- Valida DTOs (`ValidationPipe({ whitelist: true })`)
- Proxy hacia el monolith vía HTTP interno (`Authorization: Bearer <M2M EdDSA JWT>`, no `x-internal-token`)
- Único egress hacia ServiceNow: proxy de salida hacia `api-snowq-service` (`ServiceNowOutboundController`) — `integration-service` no interviene en este flujo

---

## Rutas de entrada (inbound) — principales

| Prefijo | Descripción |
|---------|-------------|
| `GET /api/auth/me` | Perfil del usuario autenticado (sync lazy con el monolith) |
| `GET /api/corners` | Corners activos |
| `GET /api/availability/:cornerId` | Slots disponibles |
| `GET /api/appointments` | Listar citas con filtros (paginado) |
| `POST /api/appointments` | Crear cita (`kind` se deriva del `IssueType`) |
| `GET /api/appointments/:id` | Detalle de cita |
| `PATCH /api/appointments/:id/take` \| `/release` \| `/deliver` \| `/status` \| `/validate` \| `/reopen` \| `/cancel` | Transiciones de estado |
| `POST /api/batch-drafts/*` | Creación masiva de citas (holds de slots) |

Superficie completa: `apps/api-gateway/src/inbound/appointments/appointments.controller.ts`.

## Rutas de salida (outbound) — único egress hacia ServiceNow

| Ruta | Destino | Protección |
|------|---------|-----------|
| `POST /outbound/servicenow/immediate/{incidents\|service-catalog}` | `api-snowq-service` | Bearer M2M EdDSA (`JwtGuard` + `@InternalOnly`) |
| `POST /outbound/servicenow/{incidents\|service-catalog}` | `api-snowq-service` (fallback async) | ídem |
| `PATCH /outbound/servicenow/immediate/{table}/:sysId` | `api-snowq-service` (update genérico) | ídem |
| `PATCH /outbound/servicenow/immediate/incidents/:sysId/close` | `api-snowq-service` (cierre) | ídem |
| `GET /outbound/servicenow/{correlationId}` | `api-snowq-service` (reconcile) | ídem |

Controller real: `apps/api-gateway/src/outbound/servicenow/servicenow-outbound.controller.ts`.

---

## Variables de entorno requeridas

```env
API_GATEWAY_PORT=4000                    # dev (staging/prod: 3000)
MONOLITH_URL=http://localhost:3002       # dev (staging/prod: http://monolith:3001)
SNOWQ_URL=http://localhost:3090          # único egress hacia ServiceNow
ABAC_URL=http://localhost:3005
ABAC_API_KEY=...                         # x-api-key para /auth/validate-entra, /abac/*
ABAC_APP_ID=...
ABAC_M2M_TOKEN=...                       # JWT M2M EdDSA — para llamar a monolith/snowq
ED25519_PUBLIC_KEY=...                   # clave pública de ABAC, verifica M2M entrante localmente
JWT_ISSUER=abac-service
JWT_AUDIENCE=abac-clients
```

> **Nota:** El gateway NO gestiona OAuth2 hacia ServiceNow — eso es responsabilidad de
> `api-snowq-service`. El gateway tampoco usa `x-internal-token`/`INTERNAL_API_TOKEN` — esa
> variable ya no existe, fue reemplazada por el JWT M2M Ed25519 (`ABAC_M2M_TOKEN` + verificación
> local con `ED25519_PUBLIC_KEY`, sin llamada de red a ABAC por request).

---

## Nota importante: ValidationPipe whitelist

**CRÍTICO:** `ValidationPipe({ whitelist: true })` elimina cualquier campo del body que NO tenga decoradores `class-validator`. Si un DTO no tiene decoradores, todo el body llega vacío al monolith.

Todos los DTOs del gateway DEBEN tener decoradores `@IsString()`, `@IsArray()`, etc.

---

## DTOs clave

### CreateAppointmentDto
```typescript
// apps/api-gateway/src/inbound/appointments/dto/create-appointment.dto.ts
export class CreateAppointmentDto {
    @IsString() @IsNotEmpty() issueTypeId: string;
    @IsString() @IsNotEmpty() customerId: string;
    @IsString() @IsNotEmpty() cornerId: string;
    @IsArray() @IsString({ each: true }) slotIds: string[];
    @IsString() @IsNotEmpty() startTime: string;
    @IsString() @IsNotEmpty() endTime: string;
    @IsString() @IsNotEmpty() origin: string;
    @IsObject() device: { serialNumber: string };
    @IsOptional() @IsString() lockerId?: string;
    @IsOptional() @IsObject() metadata?: Record<string, any>;
    @IsOptional() @IsString() notes?: string;
}
```

`kind` (`ISSUE`/`REQUEST`) no se envía en el DTO — se deriva server-side en el monolito a partir de `issueType.category` (`appointmentKindFromIssueCategory()`).
