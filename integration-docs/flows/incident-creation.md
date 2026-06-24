# Flujo: Creación de Incidente

## Participantes

- **Cliente** (gateway-simulator.js / App iOS / Web)
- **API Gateway** (:3000)
- **Monolith** (:3001)
- **api-snowq-service** (:3090)
- **ServiceNow**

---

## Diagrama de secuencia

```
Cliente
  │
  │ POST /incidents  { issueTypeId, customerId, cornerId, slotIds, origin, device? }
  ▼
API Gateway
  │ CorrelationMiddleware: genera x-correlation-id (UUID) o lee el header entrante
  │ valida JWT/ABAC
  │ valida DTO (whitelist:true — todos los campos DEBEN tener decoradores)
  │
  │ POST /internal/incidents  (x-internal-token, x-correlation-id)
  ▼
Monolith — IncidentService.createIncident()
  │
  ├─ 1. Obtiene y valida slots (deben ser AVAILABLE y futuros)
  ├─ 2. Obtiene user → company → issueType
  ├─ 3. Valida: issueType.treeId == company.treeId  (ABAC de tipo de incidencia)
  ├─ 4. Deriva scheduledRange desde slots
  ├─ 5. Resuelve device (si viene serialNumber)
  │       DeviceService.resolveDevice(serialNumber)
  │       → busca en DB (caché)
  │       → si stale (>15min) → llama Minerva → actualiza DB
  ├─ 6. Crea entidad Incident (status: PENDING)
  ├─ 7. Guarda Incident en DB
  ├─ 8. Bookea slots (status: BOOKED)
  │
  ├─ 9. ServiceNowIntegrationService.createIncidentTicket(incident, company, user, serialNumber)
  │       ├─ Resuelve assignment_group:
  │       │   1. CornerIssueConfig(cornerId, issueTypeId).servicenow_group
  │       │   2. Corner.snow_assignment_group
  │       │   3. 'SOPORTE_GENERAL'
  │       ├─ Resuelve category: IssueType.servicenow_category
  │       ├─ Resuelve caller_id: user.principalName ?? user.email ?? customerId
  │       ├─ [campo SN] correlation_id = device.serialNumber
  │       │     ↳ campo nativo de ServiceNow para vincular el ticket al activo físico
  │       │     ↳ NO es el mismo concepto que el header HTTP x-correlation-id
  │       │
  │       │ POST API_GATEWAY/outbound/servicenow/incidents
  │       ▼
  │   API Gateway (outbound)
  │       │ HTTP plano (sin OAuth2)
  │       │ POST OUTBOUND_GATEWAY_URL/incidents
  │       ▼
  │   api-snowq-service
  │       │ /snow-requests/immediate/incidents
  │       │ → envía a ServiceNow (sync, con circuit breaker)
  │       │ ← { sysId, number }
  │       ◄─────────────────────────────────────────────────
  │
  │   Si éxito:
  │       incident.servicenowId = sysId
  │       incident.servicenowNumber = number
  │       Guarda Incident actualizado en DB
  │
  │   Si falla SN:
  │       Logger.warn(...) — el incidente existe en DB sin SN info
  │       (reconciliación futura pendiente de implementar)
  │
  ├─ 10. Publica eventos de dominio
  ├─ 11. Invalida caché de disponibilidad
  │
  ◄── Incident { id, status, servicenowNumber, ... }
  ▼
API Gateway
  ◄── 201 Created { incident }
  ▼
Cliente
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
- **Device:** El monolith usa caché local de Minerva. Si el dispositivo no existe en caché ni en Minerva, el incidente NO se crea (fail-fast).
- **ServiceNow:** Si el ticket SN falla, el incidente queda en DB sin `servicenowNumber`. No falla el flujo — se loguea warning.
- **CornerIssueConfig:** Si no hay configuración para corner+issueType, usa el grupo del corner como fallback.
