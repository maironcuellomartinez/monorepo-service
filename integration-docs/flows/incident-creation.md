# Flujo: Creación de Cita (Appointment)

> Actualizado 2026-07-31. Este doc describía el flujo de `Incident` con auth `x-internal-token`
> — ambos fueron reemplazados: `Incident`/`Request` se unificaron en `Appointment`
> (remodelado 2026-07), y `x-internal-token` fue reemplazado por JWT M2M Ed25519/EdDSA
> (Fase 5, 2026-07-16). Ver `monolito-event-corner_v3/docs/documentation.md` e
> `infrastructure-diagram.md` para la arquitectura completa y vigente.

## Participantes

- **Cliente** (gateway-simulator.js / event-corner-app)
- **API Gateway** (staging/prod :3000 · dev :4000)
- **Monolith** (staging/prod :3001 · dev :3002)
- **api-snowq-service** (:3090)
- **ServiceNow** (real en staging/prod, `servicenow-clone-backend` en dev)

---

## Diagrama de secuencia

```
Cliente
  │
  │ POST /api/appointments  { issueTypeId, customerId, cornerId, slotIds,
  │                           startTime, endTime, origin, device, lockerId?, notes? }
  ▼
API Gateway
  │ CorrelationMiddleware: genera x-correlation-id (UUID) o lee el header entrante
  │ Guards: JwtGuard (valida Bearer Entra ID vía ABAC) → RolesGuard → AbacGuard (appointment:create)
  │ valida DTO (whitelist:true — todos los campos DEBEN tener decoradores)
  │
  │ POST /internal/appointments  Authorization: Bearer <M2M EdDSA JWT>, x-correlation-id
  ▼
Monolith — AppointmentService.createAppointment()
  │
  ├─ 1. Obtiene y valida slots (deben ser AVAILABLE y futuros)
  ├─ 2. Obtiene user → company → issueType
  ├─ 3. Valida: issueType.treeId == company.treeId
  ├─ 4. Deriva scheduledRange desde slots
  ├─ 5. Resuelve device (si viene serialNumber)
  │       DeviceService.resolveDevice(serialNumber)
  │       → busca en DB (caché)
  │       → si stale (>15min) → llama Minerva → actualiza DB
  ├─ 6. Deriva `kind` (ISSUE/REQUEST) desde issueType.category
  ├─ 7. Crea entidad Appointment (status: CREATED) + ServiceNowTicketLink (status: PENDING, role: primary)
  ├─ 8. Guarda Appointment en DB (misma transacción: appointment + appointment_slots + servicenow_ticket_links)
  ├─ 9. Bookea slots (status: BOOKED)
  ├─ 10. Publica evento APPOINTMENT_CREATED → tabla outbox_events (misma transacción)
  ├─ 11. Invalida caché de disponibilidad
  │
  ◄── Appointment { id, kind, status, scheduledRange, ... }  (la creación NO espera al ticket SN)
  ▼
API Gateway
  ◄── 201 Created { appointment }
  ▼
Cliente


  (asíncrono, ≤5s después — vía OutboxWorkerService)

OutboxWorkerService → AppointmentServiceNowHandler
  │
  ├─ ServiceNowIntegrationService.createTicket(appointment, link, company, user)
  │       ├─ Resuelve assignment_group — cadena de 4 niveles:
  │       │   1. CompanyIssueConfig(company.id, issueTypeId).servicenow_group
  │       │   2. CompanyIssueConfig(SN_DEFAULT_COMPANY_ID, issueTypeId).servicenow_group
  │       │   3. Corner.snow_assignment_group
  │       │   4. 'SOPORTE_GENERAL' + warn log
  │       ├─ Resuelve category: IssueType.servicenow_category
  │       ├─ Resuelve caller_id: user.upn
  │       ├─ [campo SN] correlation_id = device.serialNumber
  │       │     ↳ campo nativo de ServiceNow para vincular el ticket al activo físico
  │       │     ↳ NO es el mismo concepto que el header HTTP x-correlation-id
  │       │
  │       │ Bearer M2M EdDSA → POST /outbound/servicenow/immediate/{incidents|service-catalog}
  │       ▼
  │   API Gateway (ServiceNowOutboundController — único egress hacia SN)
  │       │ Bearer M2M EdDSA
  │       │ POST /snow-requests/immediate/{incidents|service-catalog}
  │       ▼
  │   api-snowq-service
  │       │ Basic Auth → ServiceNow (real) / servicenow-clone-backend (dev)
  │       │ ← { sysId, number }  (o { correlationId } si cae al fallback async)
  │       ◄─────────────────────────────────────────────────
  │
  │   Si éxito inmediato:
  │       link.resolveImmediate(sysId, number)  — persiste en servicenow_ticket_links
  │
  │   Si deferred (SN caído, fallback async):
  │       link.markDeferred(correlationId)  — MonolithReconcilerJob completará luego (cada 30s)
  │
  │   Si falla ambas fases:
  │       Logger.error(...) — el handler re-lanza, OutboxWorkerService reintenta con backoff
  │       (hasta 5 veces; si se agotan, SnowOrphanRecoveryJob la recupera cada 10 min)
```

---

## Errores comunes y causas

| Error | Causa | Fix |
|-------|-------|-----|
| `Slots not available` | Los slots ya están bookados o son pasados | Consultar availability con `?duration=60` y usar slots futuros |
| `User has no company assigned` | Usuario sin empresa en DB | Asignar company al usuario en seed |
| `IssueTypeNotAllowedForCompany` | El issueType no pertenece al árbol de la empresa del usuario | Verificar `tree_id` de issueType vs `tree_id` de company |
| Body vacío en monolith | `ValidationPipe whitelist:true` eliminó todo porque el DTO no tenía decoradores | Agregar `class-validator` decorators al DTO |
| `deviceId: null` en respuesta | No se pasó `device.serialNumber` en el request | Incluir `device: { serialNumber: "..." }` en el body |

---

## Notas

- **Slots:** No se borran de DB cuando se usan — son históricos. `AvailabilityService` filtra `windowStart <= new Date()` para no mostrar ventanas pasadas.
- **Device:** El monolith usa caché local de Minerva. Si el dispositivo no existe en caché ni en Minerva, la cita NO se crea (fail-fast).
- **ServiceNow:** La creación del ticket es **asíncrona** (vía Outbox), no bloquea la respuesta al cliente. Si falla, el `ServiceNowTicketLink` queda `PENDING` sin `sys_id` — lo recupera `SnowOrphanRecoveryJob`.
- **CompanyIssueConfig:** Si no hay configuración para company+issueType, cae al fallback de la empresa default y luego al grupo del corner.
- **`SnowSyncJob` fue eliminado** — el monolito nunca polea estado desde ServiceNow; el cierre del ticket se dispara siempre desde el monolito (`AppointmentStatusChangedHandler`) cuando la cita pasa a `CLOSED`.
