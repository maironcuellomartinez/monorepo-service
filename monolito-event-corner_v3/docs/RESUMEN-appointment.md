# Resumen — Módulo de Citas: api-gateway + monolith (entradas/salidas)

> Alcance: solo `api-gateway` y `monolith`, y sus salidas hacia `api-snowq-service` e `integration-service`. No incluye frontend.

## 1. Entrada — api-gateway (`api/appointments/*`)

Todo request pasa por la cadena de guards `JwtGuard → RolesGuard → AbacGuard` antes de llegar al controller. `JwtGuard` acepta tanto un Bearer de Entra ID (validado contra ABAC vía JWKS) como un JWT M2M Ed25519 propio (`@InternalOnly()`).

| Método | Ruta | Permiso ABAC |
|---|---|---|
| `GET` | `/api/appointments` | `appointment:list` — filtros: `cornerId`, `status`, `issueTypeId`, `customerEmail` (matchea también `upn`), `servicenowNumber`, `deviceSerial`, `dateFrom`/`dateTo`, `availableOnly` |
| `GET` | `/api/appointments/suggestions/device-serial` \| `/servicenow-number` | `appointment:list` — autocomplete acotado a un `cornerId` |
| `GET` | `/api/appointments/available` | `appointment:list` |
| `GET` | `/api/appointments/mine` | `appointment:read` |
| `GET` | `/api/appointments/technician/:technicianId` | `appointment:list` |
| `GET` | `/api/appointments/:id` \| `/:id/timeline` | `appointment:read` |
| `POST` | `/api/appointments` | `appointment:create` |
| `POST` | `/api/appointments/:id/notes` | `appointment:change-status` |
| `PATCH` | `/:id/deliver` \| `/:id/take` \| `/:id/release` \| `/:id/reschedule` \| `/:id/estimated-close` \| `/:id/status` \| `/:id/cancel` | permiso específico por acción |
| `PATCH` | `/:id/validate` \| `/:id/reopen` | `appointment:validate` \| `appointment:reopen` |

`api-gateway` es un **proxy delgado**: no tiene lógica de dominio. Valida el DTO, resuelve el permiso, y reenvía tal cual al monolith.

## 2. api-gateway → monolith (`/internal/appointments/*`)

- `MonolithClient` reenvía cada request con `Authorization: Bearer <JWT M2M Ed25519>` propio del gateway (no el token del usuario final).
- Mismo mapeo de rutas que el punto 1, con prefijo `/internal/` en vez de `/api/`.
- El monolith no vuelve a validar permisos ABAC — confía en que el gateway ya filtró.

## 3. Monolith — qué hace con el request

`AppointmentService.createAppointment()` (y equivalentes para el resto de las transiciones) es el único caso de uso para cualquier `kind`:

1. Valida slots (disponibles y futuros), corner, issueType y su `treeId` contra la empresa del cliente.
2. Deriva `kind` (`ISSUE`/`REQUEST`) desde `issueType.category`.
3. Resuelve el dispositivo si viene `serialNumber` — acá es donde entra **integration-service** (ver punto 5).
4. Persiste `Appointment` + `AppointmentSlot`(s) + `AppointmentTimeline` + un `ServiceNowTicketLink` en `PENDING`, y publica `APPOINTMENT_CREATED` en la misma transacción (patrón Outbox).
5. Responde `201` **sin esperar** al ticket de ServiceNow — esa parte es asíncrona.

## 4. Monolith → api-gateway → api-snowq-service (ServiceNow)

Único egress hacia ServiceNow. Se dispara `≤5s` después, vía el worker del Outbox — nunca en el mismo request que crea la cita.

```
OutboxWorkerService (5s)
  → AppointmentServiceNowHandler (creación) / AppointmentStatusChangedHandler (cierre/estado)
  → ServiceNowIntegrationService.createTicket() / closeTicket() / updateTicket()
        resuelve: assignment_group (CompanyIssueConfig → default company → Corner → 'SOPORTE_GENERAL')
                  category (IssueType.servicenow_category)
                  caller_id (User.upn)
                  correlation_id (Device.serialNumber)
  → ServiceNowProxyAdapter
        Bearer M2M EdDSA → api-gateway POST /outbound/servicenow/immediate/{incidents|service-catalog}
```

En `api-gateway`, `ServiceNowOutboundController` reenvía con su propio M2M a `api-snowq-service`:

| Operación | Ruta hacia api-snowq-service |
|---|---|
| Crear (fase 1, síncrona) | `POST /snow-requests/immediate/{incidents\|service-catalog}` |
| Crear (fase 2, fallback async) | `POST /snow-requests/{incidents\|service-catalog}` — si falla la fase 1 |
| Actualizar | `PATCH /snow-requests/immediate/{table}/:sysId` |
| Cerrar | `PATCH /snow-requests/immediate/incidents/:sysId/close` |
| Reconciliar (deferred) | `GET /snow-requests/:correlationId` |

Resultado según la fase:
- **Éxito inmediato:** `link.resolveImmediate(sysId, number)` — el `ServiceNowTicketLink` queda `ACTIVE` con el ticket real.
- **Deferred (SN caído momentáneamente):** `link.markDeferred(correlationId)` — `MonolithReconcilerJob` (cada 30s) pregunta a `api-snowq-service` hasta que resuelve.
- **Huérfana (nunca llegó a tener correlationId):** `SnowOrphanRecoveryJob` (cada 10 min) crea un link nuevo y reintenta.
- **Cierre:** siempre lo dispara el monolito (`AppointmentStatusChangedHandler`) cuando la cita pasa a `CLOSED`. No hay polling de estado desde ServiceNow hacia el monolito en ningún punto del flujo.

`integration-service` **no participa** en ninguna parte de este camino — el único egress hacia ServiceNow es `api-gateway → api-snowq-service`.

## 5. Monolith → api-gateway → integration-service (resolución de dispositivo)

Único punto de contacto real entre el módulo de citas e `integration-service`, y es de **entrada** de datos (no ServiceNow):

```
AppointmentService (al crear una cita con serialNumber)
  → DeviceService.resolveDevice(serialNumber)
        cache local (DB) — si está fresco (<15 min), lo devuelve directo
        si está stale o no existe → IExternalInventoryService.getBySerial()
  → InventoryHttpAdapter
        Bearer M2M EdDSA → api-gateway GET /outbound/inventory/devices/:serialNumber
  → api-gateway (InventoryOutboundController, @InternalOnly)
        Bearer M2M EdDSA → integration-service GET /api/v1/minerva/devices/:serialNumber
  → integration-service → Minerva SOAP
```

- Si `integration-service` no responde, `api-gateway` devuelve `502` y el monolito lo propaga — la creación de la cita puede fallar si el dispositivo no se puede resolver ni desde caché ni desde Minerva (fail-fast, no crea citas con datos de dispositivo inconsistentes).
- Misma ruta para `GET /outbound/inventory/users/:userId` (dispositivos de un usuario, usado al sincronizar).

## 6. Resumen de autenticación entre saltos

Todos los saltos internos (api-gateway↔monolith, api-gateway↔api-snowq-service, api-gateway↔integration-service) usan el mismo mecanismo: JWT M2M firmado con **Ed25519/EdDSA** por ABAC, verificado **localmente** por cada servicio receptor (sin llamada de red a ABAC por request). El `x-correlation-id` viaja en cada salto para no cortar la trazabilidad end-to-end.
