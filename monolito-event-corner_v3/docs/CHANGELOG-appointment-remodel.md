# Changelog — Remodelado Incident/Request → Appointment

> Comparación completa: `workspace-prueba-arquitectura` (base) ↔ `feature/appointment-domain-remodel` (rama actual).
> 11 commits · **151 archivos** · +7906 / −9892 líneas.
> Generado 2026-07-30. La rama **no** tiene PR/merge planeado a corto plazo (política explícita — ver decisión del proyecto).

## Resumen ejecutivo

El cambio central es la unificación de las entidades `Incident` y `Request` (antes separadas, con tablas, servicios y controladores propios) en una única entidad `Appointment` ("Cita"). Sobre esa base se hicieron varias mejoras incrementales: extracción del vínculo ServiceNow a una entidad propia (`ServiceNowTicketLink`), renombre de `principalName`→`upn` en todo el stack, fixes de integración ServiceNow (ruta de cierre, persistencia), y mejoras de UX en `event-corner-app` (autocomplete, paginación con filtro de activas, reorganización del header) y en `auth-configuration-app`/`abac-microservice` (edición de perfil de usuario).

---

## 1. Archivos nuevos (28)

### Monolith — dominio Appointment
| Archivo | Líneas | Qué es |
|---|---:|---|
| `apps/monolith/src/core/domain/entities/appointment.entity.ts` | +765 | Entidad de dominio `Appointment`, reemplaza `Incident`+`Request` |
| `apps/monolith/src/core/domain/entities/appointment.entity.spec.ts` | +511 | Tests unitarios de la entidad |
| `apps/monolith/src/core/domain/entities/servicenow-ticket-link.entity.ts` | +158 | Entidad de dominio `ServiceNowTicketLink` (vínculo 1:N cita↔ticket SN) |
| `apps/monolith/src/core/domain/enums/appointment-kind.enum.ts` | +52 | `AppointmentKind` (ISSUE/REQUEST) + `appointmentKindFromIssueCategory()` |
| `apps/monolith/src/core/domain/enums/appointment-origin.enum.ts` | +8 | Canal de origen de la cita |
| `apps/monolith/src/core/domain/enums/appointment-status.enum.spec.ts` | +88 | Tests de la máquina de estados |
| `apps/monolith/src/core/domain/errors/appointment.errors.ts` | +47 | `AppointmentNotFoundError`, `AppointmentNotAvailableError`, `InvalidAppointmentStateError`, `AppointmentTechnicianNotAuthorizedError`, `DeviceHasActiveAppointmentError` |
| `apps/monolith/src/core/domain/errors/servicenow.errors.ts` | +28 | Errores de dominio para `ServiceNowTicketLink` |
| `apps/monolith/src/core/domain/value-objects/servicenow-ticket-type.value.ts` | +10 | `ServiceNowTicketType` (`'incident' \| 'sc_req_item' \| 'sc_task'`) |
| `apps/monolith/src/core/ports/incoming/appointment/appointment-service.port.ts` | +135 | Puerto `IAppointmentService` |
| `apps/monolith/src/core/ports/outgoing/repositories/appointment-repository.port.ts` | +135 | Puerto `IAppointmentRepository` (incluye `suggestDeviceSerials`/`suggestServiceNowNumbers` agregados en esta sesión) |
| `apps/monolith/src/core/ports/outgoing/repositories/servicenow-ticket-link-repository.port.ts` | +15 | Puerto `IServiceNowTicketLinkRepository` |
| `apps/monolith/src/core/services/appointment/appointment.service.ts` | +1271 | Servicio de aplicación `AppointmentService` — reemplaza `IncidentService`+`RequestService` |
| `apps/monolith/src/infrastructure/event-handlers/appointment-servicenow.handler.ts` | +131 | Maneja creación de ticket SN al crear una cita |
| `apps/monolith/src/infrastructure/event-handlers/appointment-status-changed.handler.ts` | +224 | Maneja cambios de estado + cierre de ticket SN (con el fix de persistencia de esta sesión) |
| `apps/monolith/src/infrastructure/persistence/typeorm/entities/servicenow-ticket-link.entity.ts` | +58 | Entidad TypeORM `servicenow_ticket_links` |
| `apps/monolith/src/infrastructure/persistence/typeorm/repositories/appointment.repository.ts` | +693 | Repositorio TypeORM (incluye enriquecimiento `serviceNowLinkInfo`, `customerInfo.upn`, y las queries de autocomplete agregadas esta sesión) |
| `apps/monolith/src/infrastructure/persistence/typeorm/repositories/servicenow-ticket-link.repository.ts` | +121 | Repositorio TypeORM de `ServiceNowTicketLink` |
| `apps/monolith/src/internal-api/appointments/internal-appointments.controller.ts` | +337 | Controller `/internal/appointments/*` — incluye los endpoints de sugerencias agregados esta sesión |

### Migraciones (monolith)
| Archivo | Líneas | Qué hace |
|---|---:|---|
| `1785100000000-CreateAppointmentsTable.ts` | +68 | Crea tabla `appointments` |
| `1785200000000-CreateAppointmentSlotsTable.ts` | +38 | Crea tabla `appointment_slots` |
| `1785300000000-CreateServicenowTicketLinksTable.ts` | +49 | Crea tabla `servicenow_ticket_links` |
| `1785400000000-CreateAppointmentTimelineTable.ts` | +43 | Crea tabla `appointment_timeline` |
| `1785500000000-BackfillAppointmentsFromIncidentsAndRequests.ts` | +167 | Migra datos de `incidents`+`requests` → `appointments` |
| `1785600000000-DropIncidentsAndRequestsLegacyTables.ts` | +137 | Borra las tablas legacy tras el backfill |
| `1785700000000-RenamePrincipalNameToUpnOnUsers.ts` | +30 | Renombra `users.principal_name`→`upn`, agrega `UNIQUE` |

### Frontend (event-corner-app)
| Archivo | Líneas | Qué es |
|---|---:|---|
| `src/hooks/use-company-tree.ts` | +32 | Hook para resolver el `treeId` de la empresa del cliente |
| `src/hooks/use-suggestions.ts` | +40 | Hook de autocomplete genérico (debounce 300ms) — agregado esta sesión |

---

## 2. Archivos eliminados (32)

### Monolith — dominio legacy Incident/Request
`core/domain/entities/incident.entity.ts` (+ `.spec.ts`), `core/domain/entities/request.entity.ts`, `core/domain/enums/incident-origin.enum.ts`, `core/domain/enums/incident-status.enum.spec.ts`, `core/domain/errors/incident.errors.ts`, `core/ports/incoming/incident/incident-service.port.ts`, `core/ports/incoming/request/request-service.port.ts`, `core/ports/outgoing/repositories/incident-repository.port.ts`, `core/ports/outgoing/repositories/request-repository.port.ts`, `core/services/incident/incident.service.ts` (−1342 líneas), `core/services/request/request.service.ts`, `infrastructure/event-handlers/incident-servicenow.handler.ts`, `infrastructure/event-handlers/incident-status-changed.handler.ts`, `infrastructure/event-handlers/request-servicenow.handler.ts`, `infrastructure/jobs/snow-sync.job.ts` (**decisión de producto**: el monolito ya no polea estado desde SN, cierra directo), `infrastructure/persistence/typeorm/entities/request-activity.entity.ts`, `infrastructure/persistence/typeorm/entities/request.entity.ts`, `infrastructure/persistence/typeorm/repositories/incident.repository.ts` (−777 líneas), `infrastructure/persistence/typeorm/repositories/request.repository.ts`, `internal-api/incidents/internal-incidents.controller.ts`, `internal-api/requests/dto/requests.dto.ts`, `internal-api/requests/internal-requests.controller.ts`.

### api-gateway
`inbound/requests/dto/create-request.dto.ts`, `inbound/requests/requests.controller.ts`.

### event-corner-app
`src/pages/create-request-page.tsx` (−449), `src/pages/requests-page.tsx` (−157) — sus equivalentes `incidents-page.tsx`/`create-incident-page.tsx`/`incident-detail-page.tsx` no se borraron, se **renombraron** (ver sección 3).

### libs/shared — código muerto post-unificación
`contracts/servicenow-client.port.ts`, `types/incident-types.ts`, `value-objects/date-range.ts`, `value-objects/evidence.ts`.

### Tests
`test/incidents.e2e-spec.ts` (−304).

---

## 3. Archivos renombrados (17)

| Antes | Ahora | % similar |
|---|---|---:|
| `event-corner-app/src/pages/incident-detail-page.tsx` | `appointment-detail-page.tsx` | 76% |
| `event-corner-app/src/pages/incidents-page.tsx` | `appointments-page.tsx` | 62% (+259/−… por el autocomplete/paginación agregados esta sesión) |
| `event-corner-app/src/pages/create-incident-page.tsx` | `create-appointment-page.tsx` | 91% |
| `api-gateway/src/inbound/incidents/incidents.controller.ts` | `inbound/appointments/appointments.controller.ts` | 56% |
| `api-gateway/.../dto/change-status.dto.ts` | `appointments/dto/change-status.dto.ts` | 85% |
| `api-gateway/.../dto/create-incident.dto.ts` | `appointments/dto/create-appointment.dto.ts` | 88% |
| `api-gateway/.../dto/release-incident.dto.ts` | `appointments/dto/release-appointment.dto.ts` | 83% |
| `api-gateway/.../dto/reschedule-incident.dto.ts` | `appointments/dto/reschedule-appointment.dto.ts` | 83% |
| `api-gateway/.../dto/set-estimated-close.dto.ts` | (mismo nombre, solo cambia de carpeta) | 100% |
| `api-gateway/.../dto/take-incident.dto.ts` | `appointments/dto/take-appointment.dto.ts` | 87% |
| `monolith/.../constants/incident.constants.ts` | `appointment.constants.ts` | 66% |
| `monolith/.../enums/incident-status.enum.ts` | `appointment-status.enum.ts` | 54% (agrega `PAUSED`) |
| `monolith/.../core/services/incident/incident.service.spec.ts` | `appointment/appointment.service.spec.ts` | 50% |
| `monolith/.../typeorm/entities/incident-slot.entity.ts` | `appointment-slot.entity.ts` | 51% |
| `monolith/.../typeorm/entities/incident-timeline.entity.ts` | `appointment-timeline.entity.ts` | 59% |
| `monolith/.../typeorm/entities/incident.entity.ts` | `appointment.entity.ts` | 64% |
| `monolith/internal-api/incidents/dto/incidents.dto.ts` | `appointments/dto/appointments.dto.ts` | 83% |

---

## 4. Archivos modificados (74) — agrupados por tema

### 4.1 Sesión actual (hoy) — UX de header + edición de usuario ABAC
| Archivo | Δ líneas | Cambio |
|---|---:|---|
| `event-corner-app/src/components/header.tsx` | +33/−… | Agrega botón "Cerrar sesión" + prop `icon` + texto de `upn` |
| `event-corner-app/src/components/sidebar.tsx` | +39/−… | Quita el botón de logout (movido al header) |
| `event-corner-app/src/context/auth.tsx` | +2 | Agrega campo `upn` a `AuthUser` |
| `event-corner-app/src/pages/login-page.tsx` | +6/−… | Label "UPN" en vez de "Email"; fallback de nombre usa la parte local del email |
| `event-corner-app/src/pages/devices-page.tsx` | +43/−… | Agrega toggle de tema + logout + UPN a su header propio |
| `event-corner-app/src/pages/dashboard-page.tsx` | **+782/−…** (reescritura grande, ver nota) | Agrega ícono `LayoutDashboard` al header — el resto del diff grande es de commits anteriores en este mismo archivo |
| `event-corner-app/src/pages/appointments-page.tsx` | +259 | Autocomplete UPN/serial/SN Number, filtro por defecto a estados activos + checkbox "Todas las citas", corner sigue siendo obligatorio |
| `event-corner-app/src/lib/api.ts` | +145/−… | Tipos/funciones de sugerencias, `MeResponse.upn`, etc. |
| `abac-microservice/src/abac/dtos/update-user.dto.ts` | +14/−… | Reemplaza `name`(→username, bug) por `firstName`/`lastName`/`username` explícitos |
| `abac-microservice/src/abac/services/user.service.ts` | +8/−… | Persiste `firstName`/`lastName`/`username` en `updateUser()` |
| `auth-configuration-app/src/components/users-page.tsx` | +123/−… | Nuevo diálogo "Editar datos" (nombre, apellido, usuario, teléfono) |
| `monolito-event-corner_v3/apps/api-gateway/src/inbound/appointments/appointments.controller.ts` | (parte de +240 total) | Nuevos endpoints `suggestions/device-serial` y `suggestions/servicenow-number` |
| `monolito-event-corner_v3/apps/monolith/src/core/ports/outgoing/repositories/appointment-repository.port.ts` | (parte de +135 total) | Firma de `suggestDeviceSerials`/`suggestServiceNowNumbers` |
| `monolito-event-corner_v3/apps/monolith/src/infrastructure/persistence/typeorm/repositories/appointment.repository.ts` | (parte de +693 total) | Implementación de las sugerencias (con el fix del bug `DISTINCT` mal ubicado en `.select()`) |
| `monolito-event-corner_v3/apps/monolith/src/internal-api/appointments/internal-appointments.controller.ts` | (parte de +337 total) | Endpoints de sugerencias en el monolito |
| `CLAUDE.md`, `docs/documentation.md`, `docs/er-diagram.md` | +2/+2/+4 (previos) + reescritura hoy | Actualizados hoy para reflejar el modelo `Appointment` unificado (ver este mismo commit) |

### 4.2 Commits previos — unificación Incident+Request → Appointment (grueso del diff)
| Archivo | Δ líneas | Cambio |
|---|---:|---|
| `apps/monolith/src/core/domain/entities/user.entity.ts` | +14/−… | Agrega `upn` |
| `apps/monolith/src/core/domain/enums/issue-category.enum.ts` | +13/−… | `CREATE-DELIVERY`/`CREATE-COLLECTION`/`REQUEST-ONBOARDING`/`REQUEST-DECOMISSION` (reemplaza categorías viejas) |
| `apps/monolith/src/core/domain/value-objects/device-type.value.ts` | +2/−… | Agrega `PANTALLA`, `SIM`, `EQUIPO_SOBREMESA` |
| `apps/monolith/src/core/domain/value-objects/servicenow-category.value.ts` | +27/−… | Ajustes de categorías SN |
| `apps/monolith/src/core/ports/incoming/service-tokens.ts`, `core/ports/index.ts`, `core/ports/outgoing/repositories/tokens.ts` | varios | `APPOINTMENT_SERVICE`/`APPOINTMENT_REPOSITORY`/`SERVICENOW_TICKET_LINK_REPOSITORY` reemplazan tokens de Incident/Request |
| `apps/monolith/src/core/services/availability/availability.service.ts` (+ `.spec.ts`) | +52/+30 | Adaptado a `Appointment` en vez de `Incident` |
| `apps/monolith/src/core/services/batch-draft/batch-draft.service.ts` | +36/−… | Crea `Appointment` en vez de `Incident` |
| `apps/monolith/src/core/services/core-services.module.ts` | +42/−… | Registra `AppointmentService`, quita `IncidentService`/`RequestService` |
| `apps/monolith/src/core/services/servicenow/servicenow-integration.service.ts` (+ `.spec.ts`) | +551/+53 | Reescrito para operar sobre `ServiceNowTicketLink` en vez de campos inline; unifica lógica de creación incident/RITM |
| `apps/monolith/src/infrastructure/external/servicenow/servicenow-proxy.adapter.ts` | +40/−… | Adaptado a la nueva integración |
| `apps/monolith/src/infrastructure/jobs/monolith-reconciler.job.ts` | +221/−… (neto negativo) | Reconcilia `ServiceNowTicketLink` en vez de campos inline en Incident/Request |
| `apps/monolith/src/infrastructure/jobs/sn-company-sync.job.ts`, `snow-orphan-recovery.job.ts` | menor | Adaptados a `Appointment` |
| `apps/monolith/src/infrastructure/persistence/typeorm/entities/{company,corner,corner-slot,schedule-assignment,technician,user}.entity.ts` | menor | Ajustes de relaciones hacia `AppointmentEntity` |
| `apps/monolith/src/infrastructure/persistence/typeorm/repositories/{issue-type,servicenow-profile,user}.repository.ts` | menor | Ajustes menores |
| `apps/monolith/src/infrastructure/persistence/typeorm/typeorm-persistence.module.ts` | +40/−… | Registra nuevas entidades TypeORM |
| `apps/monolith/src/internal-api/internal-api.module.ts` | +6/−… | Registra `InternalAppointmentsController`, quita los de incidents/requests |
| `apps/monolith/src/internal-api/issue-type-trees/internal-issue-type-trees.controller.ts` | +23 | Fix de borrado de árbol bloqueado por FK (bug de esta rama, sesión anterior) |
| `apps/monolith/src/internal-api/users/internal-users.controller.ts` | +21/−… | `SyncUserDto.upn`, respuestas usan `upn` |
| `apps/monolith/src/monolith.module.ts` | +34/−… | Registro de módulos actualizado |
| `apps/monolith/src/scripts/seed-test-data.ts` | +73/−… | Seed usa `appointments`/`upn` en vez de `incidents`/`requests`/`principal_name` |
| `apps/api-gateway/src/api-gateway.module.ts` | +6/−… | Registra `AppointmentsController` |
| `apps/api-gateway/src/auth/decorators/permission.decorator.ts` | +2/−… | Doc/ejemplo actualizado |
| `apps/api-gateway/src/client/monolith.client.ts` | +16/−… | — |
| `apps/api-gateway/src/inbound/admin/issue-types.controller.ts` | +6/−… | — |
| `apps/api-gateway/src/inbound/admin/users.controller.ts` | +2/−… | Doc actualizado a "email o upn" |
| `apps/api-gateway/src/inbound/auth/auth.controller.ts` | +6/−… | `/me` usa `upn` en vez de `principal_name` |
| `apps/api-gateway/src/inbound/batch-drafts/batch-drafts.controller.ts` | +14/−… | Crea `Appointment` |
| `apps/api-gateway/src/inbound/external/external-records.controller.ts` | +8/−… | — |
| `apps/api-gateway/src/outbound/servicenow/servicenow-outbound.controller.ts` | +56/−… | Fix de ruta plural en cierre de ticket (`resolveCloseTablePath()`, sesión anterior) |
| `libs/shared/src/errors/domain-error.ts` | +10 | `IssueTypeTreeInUseError` |
| `simulators/gateway-simulator.js` | +100 | Actualizado para el flujo de `/api/appointments` |

### Frontend (event-corner-app) — resto de páginas afectadas por el rename
`App.tsx` (+26/−…, rutas), `hooks/useAbacCheck.ts` (+6/−…), `pages/availability-page.tsx` (+96/−…), `pages/batch-incident-page.tsx` (+31/−…), `pages/companies-page.tsx` (+2), `pages/corners-page.tsx` (+2), `pages/issue-types-page.tsx` (+22/−…, categorías crudas en vez de traducidas), `pages/users-page.tsx` (+24/−…, UPN como identificador).

> **Nota sobre `dashboard-page.tsx` (+782/−…):** es el archivo con más cambio bruto de todo el diff. La mayor parte corresponde a commits anteriores a esta sesión (adaptación de referencias a `incidents`/`requests` → `appointments` en las vistas de Admin/Manager/Technician/Employee dashboard); hoy solo se le agregó el ícono del header.

---

## 5. Deuda de documentación pendiente

`docs/er-diagram.md` quedó parcialmente actualizado en este mismo commit: el diagrama ER, el mapa de relaciones y el mapa de tokens DI ya reflejan `Appointment`/`ServiceNowTicketLink`. **Pendiente** (marcado con un aviso explícito en el archivo): las secciones "Modelo UML del Dominio", "Diagrama de flujo de implementación" y "Checklist por entidad nueva" todavía describen las clases `Incident`/`Request` separadas y mencionan `SnowSyncJob` (removido). Requieren una pasada dedicada por el volumen de diagramas mermaid involucrados.
