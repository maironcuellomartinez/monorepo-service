# Resumen — Remodelado Incident/Request → Appointment

> TL;DR de la rama `feature/appointment-domain-remodel` (2026-07). Para el detalle completo ver los links al final.

## Qué cambió

`Incident` y `Request` (antes entidades/tablas/servicios separados) se unificaron en una única entidad **`Appointment`** ("Cita"). Un campo (`kind`) decide el mecanismo técnico de creación de ticket ServiceNow — ya no la clase del agregado.

```
IssueType.category → AppointmentKind (kind)
  ISSUE / CREATE-DELIVERY / CREATE-COLLECTION  →  kind=ISSUE     →  ticket SN: incident
  REQUEST-ONBOARDING / REQUEST-DECOMISSION     →  kind=REQUEST   →  ticket SN: sc_req_item/sc_task
```

El vínculo con ServiceNow (`sys_id`, `number`, `correlation_id` async) ya no son columnas inline — viven en una entidad separada, **`ServiceNowTicketLink`** (1:N respecto a `Appointment`, para soportar una RITM + varios `sc_task` de cumplimiento).

## Renombres clave (cheat sheet)

| Antes | Ahora |
|---|---|
| `Incident` + `Request` (entidades) | `Appointment` |
| `IncidentService` + `RequestService` | `AppointmentService` |
| `IIncidentService` / `IRequestService` | `IAppointmentService` |
| `IncidentRepository` / `RequestRepository` | `AppointmentRepository` |
| `IncidentServiceNowHandler` + `RequestServiceNowHandler` | `AppointmentServiceNowHandler` |
| `IncidentStatusChangedHandler` | `AppointmentStatusChangedHandler` |
| `createIncidentTicket()` / `closeIncidentTicket()` | `createTicket()` / `closeTicket()` (un solo método para ambos `kind`) |
| `incident.servicenowId` / `.servicenowNumber` (inline) | `ServiceNowTicketLink.sysId` / `.number` (entidad separada) |
| `INCIDENT_CREATED`, `INCIDENT_STATUS_CHANGED`, `INCIDENT_REOPENED` | `APPOINTMENT_CREATED`, `APPOINTMENT_STATUS_CHANGED`, `APPOINTMENT_REOPENED` |
| `/api/incidents`, `/api/requests` | `/api/appointments` (superficie única) |
| `incidents`, `requests` (tablas) | `appointments`, `appointment_slots`, `appointment_timeline`, `servicenow_ticket_links` |
| `user.principalName` | `user.upn` (renombrado + ahora **único**) |
| `IncidentStatus` (12 valores) | `AppointmentStatus` (13 valores — agrega `PAUSED`) |

## Otros cambios de esta rama

- **`SnowSyncJob` eliminado** — el monolito ya nunca polea estado desde ServiceNow. El cierre siempre se dispara desde el monolito hacia SN (`AppointmentStatusChangedHandler`), nunca al revés.
- **`upn`** reemplaza a `email` como identificador primario del usuario en el frontend; `email` queda como campo separado, reservado para notificaciones futuras. Tiene constraint `UNIQUE`.
- **event-corner-app**: autocomplete de UPN/serial de dispositivo/número SN en `/citas`, filtro por defecto a citas activas (checkbox "Todas las citas"), logout+tema movidos al header, corner sigue siendo obligatorio para listar citas.
- **ABAC / `auth-configuration-app`**: nuevo diálogo para editar `firstName`/`lastName`/`username`/`phone` de un usuario — antes solo se completaban en el primer login vía Entra ID y quedaban fijos.
- Los 11 permisos `appointment:*` en ABAC ya están seedeados y verificados contra la DB real.

## Dónde mirar para más detalle

| Doc | Contenido |
|---|---|
| `documentation.md` | Modelo de dominio completo, endpoints, casos de uso, ejemplos CURL, integración SN |
| `er-diagram.md` | ER + relaciones + tokens DI (⚠️ la sección UML de clases todavía no está actualizada) |
| `infrastructure-diagram.md` | Mapa de todos los servicios del ecosistema, puertos, auth |
| `architecture-diagrams.md` | Diagramas de secuencia detallados (guards, creación, cierre, DI con Symbols) |
| `CHANGELOG-appointment-remodel.md` | Diff archivo por archivo vs. `workspace-prueba-arquitectura` (151 archivos) |
| `1. Flujo_de_reconciliación_estado_final.md` | Reintentos, huérfanas, recuperación |
| `batch-drafts.md` | Creación masiva de citas (holds de slots) |
