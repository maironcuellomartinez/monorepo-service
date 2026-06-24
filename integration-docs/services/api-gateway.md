# API Gateway — monolito-event-corner_v3

**Puerto:** 3000
**Path:** `workspace-santander/monolito-event-corner_v3/apps/api-gateway`

---

## Rol

Único punto de entrada para clientes externos.
- Autentica (JWT + ABAC)
- Valida DTOs (`ValidationPipe({ whitelist: true })`)
- Proxy hacia el monolith vía HTTP interno (`x-internal-token`)
- Proxy de salida hacia `api-snowq-service` para operaciones ServiceNow

---

## Rutas de entrada (inbound)

| Prefijo | Descripción |
|---------|-------------|
| `POST /auth/login` | Login con email+password |
| `GET /corners` | Corners activos |
| `GET /availability` | Slots disponibles |
| `POST /incidents` | Crear incidente |
| `GET /incidents/:id` | Obtener incidente |

## Rutas de salida (outbound)

| Ruta | Destino | Protección |
|------|---------|-----------|
| `POST /outbound/servicenow/incidents` | `api-snowq-service` | `@InternalOnly` (x-internal-token) |
| `POST /outbound/servicenow/requests` | `api-snowq-service` | `@InternalOnly` |
| `PATCH /outbound/servicenow/:table/:sysId` | `api-snowq-service` | `@InternalOnly` |
| `POST /outbound/servicenow/incidents/:sysId/close` | `api-snowq-service` | `@InternalOnly` |

---

## Variables de entorno requeridas

```env
INTERNAL_API_TOKEN=xxx                        # Token que el monolith incluye en x-internal-token
OUTBOUND_GATEWAY_URL=http://localhost:3090/snow-requests/immediate   # URL del api-snowq-service
```

> **Nota:** El gateway NO gestiona OAuth2 hacia ServiceNow.
> La autenticación OAuth2 es responsabilidad del `api-snowq-service` hacia ServiceNow.

---

## Nota importante: ValidationPipe whitelist

**CRÍTICO:** `ValidationPipe({ whitelist: true })` elimina cualquier campo del body que NO tenga decoradores `class-validator`. Si un DTO no tiene decoradores, todo el body llega vacío al monolith.

Todos los DTOs del gateway DEBEN tener decoradores `@IsString()`, `@IsArray()`, etc.

---

## DTOs clave

### CreateIncidentDto
```typescript
class DeviceDto {
    @IsString() serialNumber: string;
    @IsOptional() @IsString() model?: string;
    @IsOptional() @IsString() deviceType?: string;
}

export class CreateIncidentDto {
    @IsString() issueTypeId: string;
    @IsString() customerId: string;
    @IsString() cornerId: string;
    @IsArray() @IsString({ each: true }) slotIds: string[];
    @IsString() origin: string;
    @IsOptional() @IsObject() @ValidateNested() @Type(() => DeviceDto) device?: DeviceDto;
    @IsOptional() @IsString() lockerId?: string;
    @IsOptional() metadata?: Record<string, any>;
}
```
