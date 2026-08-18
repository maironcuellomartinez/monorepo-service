# Monolith — monolito-event-corner_v3

> Actualizado 2026-07-31 — `Incident`/`Request` se unificaron en `Appointment`
> (remodelado 2026-07); `principal_name` se renombró a `upn` (único). Ver
> `monolito-event-corner_v3/docs/documentation.md` e `infrastructure-diagram.md` para el
> detalle completo.

**Puerto interno:** 3001 (staging/prod) · 3002 (dev, `MONOLITH_PORT`)
**Path:** `workspace-santander/monolito-event-corner_v3/apps/monolith`

---

## Módulos principales

### CoreServicesModule (`@Global`)
Todos los servicios de dominio. Usa factory-based DI con tokens Symbol.

| Token | Servicio | Estado |
|-------|---------|--------|
| `APPOINTMENT_SERVICE` | `AppointmentService` | ✅ integrado con SN (reemplaza `IncidentService`+`RequestService`) |
| `AVAILABILITY_SERVICE` | `AvailabilityService` | ✅ filtra ventanas pasadas |
| `DEVICE_SERVICE` | `DeviceService` | ✅ cache-as-DB, resolución desde Minerva |
| `SERVICENOW_INTEGRATION_SERVICE` | `ServiceNowIntegrationService` | ✅ resuelve grupo+category, llama al gateway |
| `CORNER_SERVICE` | `CornerService` | ✅ |
| `USER_SERVICE` | `UserService` | ✅ |
| `COMPANY_SERVICE` | `CompanyService` | ✅ |

### InfrastructureModule (`@Global`)
Adaptadores de salida registrados como providers globales.

| Token | Adaptador | Destino |
|-------|----------|---------|
| `SERVICENOW_CLIENT` | `ServiceNowProxyAdapter` | `API_GATEWAY_URL/outbound/servicenow` |
| `EXTERNAL_INVENTORY_SERVICE` | `InventoryHttpAdapter` | Minerva (inventario) |
| `EVENT_BUS` | `OutboxEventBusAdapter` | DB → OutboxWorker → InMemoryEventBus |
| `CACHE` | `LocalCacheAdapter` | En memoria |

---

## Variables de entorno requeridas

```env
API_GATEWAY_URL=http://localhost:4000       # dev (staging/prod: http://api-gateway:3000) — para outbound SN
ABAC_M2M_TOKEN=xxx                          # JWT M2M EdDSA — reemplaza el viejo INTERNAL_API_TOKEN
ED25519_PUBLIC_KEY=xxx                      # clave pública de ABAC, verifica M2M entrante localmente
SN_DEFAULT_COMPANY_SYS_ID=xxx               # Fallback sys_id de empresa en ServiceNow (campo company del ticket)
SN_DEFAULT_COMPANY_ID=xxx                   # Fallback company_id interno para buscar CompanyIssueConfig de grupos resolutores
```

`SN_DEFAULT_COMPANY_ID` debe apuntar a una compañía que tenga `CompanyIssueConfig` para
todos los issue types activos. En desarrollo: `company-santander-default-001`.

---

## Tabla de repos y tokens

| Token | Repositorio | Tabla DB |
|-------|-------------|----------|
| `CORNER_REPOSITORY` | `TypeOrmCornerRepository` | `corners` |
| `CORNER_ISSUE_CONFIG_REPOSITORY`\* | `TypeOrmCompanyIssueConfigRepository` | `company_issue_configs` |
| `APPOINTMENT_REPOSITORY` | `TypeOrmAppointmentRepository` | `appointments` |
| `SERVICENOW_TICKET_LINK_REPOSITORY` | `TypeOrmServiceNowTicketLinkRepository` | `servicenow_ticket_links` |
| `DEVICE_REPOSITORY` | `TypeOrmDeviceRepository` | `devices` |
| `USER_REPOSITORY` | `TypeOrmUserRepository` | `users` |
| `SLOT_REPOSITORY` | `TypeOrmSlotRepository` | `corner_slots` |
| `ISSUE_TYPE_REPOSITORY` | `TypeOrmIssueTypeRepository` | `issue_types` |
| `COMPANY_REPOSITORY` | `TypeOrmCompanyRepository` | `companies` |

\* El nombre de la variable del token (`CORNER_ISSUE_CONFIG_REPOSITORY`) quedó desalineado
del `Symbol('COMPANY_ISSUE_CONFIG_REPOSITORY')` que realmente contiene — resabio histórico
en el propio código (`tokens.ts:18`), no un error de esta doc.

---

## Entidades de dominio clave

### Corner
- `snow_assignment_group`: grupo resolutor **fallback** por corner (no es el principal)
- `servicenow_location`: ID de ubicación en ServiceNow
- `client_name`: **ELIMINADO** (no tenía función de negocio)

### CompanyIssueConfig
- `company_id` + `issue_type_id` → `servicenow_group` (grupo resolutor específico)
- `work_minutes_override`: override de duración por company+tipo
- Equivale a `placesissuetypes` del legacy
- Una compañía especial (`SN_DEFAULT_COMPANY_ID`) actúa como plantilla de fallback cuando
  una compañía real no tiene config propia para un issue type

### IssueType
- `servicenow_category`: categoría en ServiceNow para crear el ticket
- `servicenow_close_category`: categoría al cerrar
- `device_type`: tipo de dispositivo asociado
- `category`: `ISSUE` | `CREATE-DELIVERY` | `CREATE-COLLECTION` | `REQUEST-ONBOARDING` | `REQUEST-DECOMISSION` — decide el `AppointmentKind` de las citas creadas con este tipo

### Appointment (reemplaza `Incident` + `Request`)
- `kind`: `ISSUE` (crea ticket `incident`) o `REQUEST` (crea `sc_req_item`/`sc_task`) — derivado de `issueType.category`
- `device_id`: FK al device resuelto (cache de Minerva)
- El vínculo con ServiceNow (`sys_id`/`number`/`correlation_id` de negocio) ya **no** son
  columnas propias — viven en la entidad separada `ServiceNowTicketLink`
  (`servicenow_ticket_links`, 1:N respecto a `Appointment`)
- `correlation_id` en SN = `device.serialNumber` (esto sí sigue igual)

### User
- `upn` (User Principal Name): identificador unívoco (**único** en DB) para ServiceNow (`caller_id`) y para el frontend — renombrado desde `principal_name`
- `email`: campo de contacto separado, reservado para notificaciones futuras (no es el identificador)
- `company_id`: empresa que determina qué issue types puede usar

---

## Lógica de routing a ServiceNow

```
Resolución de assignment_group (ServiceNowIntegrationService.resolveAssignmentGroup):
  1. CompanyIssueConfig(company.id, issueTypeId)           ← config específica
  2. CompanyIssueConfig(SN_DEFAULT_COMPANY_ID, issueTypeId) ← fallback default company
  3. Corner.snow_assignment_group                           ← fallback corner
  4. 'SOPORTE_GENERAL' + warn                              ← sin configuración

Resolución de company sys_id (ServiceNowIntegrationService.resolveSnowCompanySysId):
  1. Company.profileId → ServiceNowProfile.snow_company_sys_id
  2. SN_DEFAULT_COMPANY_SYS_ID (env var)
  3. null

Resolución de category:
  IssueType.servicenow_category (directamente)

Resolución de caller_id:
  User.upn

Resolución de correlation_id:
  device.serialNumber (del comando de creación)
```

---

## API Interna (`/internal/*`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /internal/corners` | Listar corners activos |
| `GET /internal/availability` | Ventanas disponibles (requiere `duration`) |
| `GET /internal/appointments` | Búsqueda paginada de citas con filtros |
| `POST /internal/appointments` | Crear cita (reemplaza `POST /internal/incidents`) |
| `GET /internal/appointments/:id` | Obtener cita (reemplaza `GET /internal/incidents/:id`) |
| `GET /internal/appointments/suggestions/device-serial` | Autocomplete de serial, acotado a un corner |
| `GET /internal/appointments/suggestions/servicenow-number` | Autocomplete de número SN, acotado a un corner |
| `GET /internal/devices/user/:customerId` | Dispositivos cacheados de un usuario |
| `GET /internal/devices/:serialNumber/resolve` | Resolver dispositivo desde Minerva |
