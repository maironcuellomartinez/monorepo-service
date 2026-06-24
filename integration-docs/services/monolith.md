# Monolith — monolito-event-corner_v3

**Puerto interno:** 3001
**Path:** `workspace-santander/monolito-event-corner_v3/apps/monolith`

---

## Módulos principales

### CoreServicesModule (`@Global`)
Todos los servicios de dominio. Usa factory-based DI con tokens Symbol.

| Token | Servicio | Estado |
|-------|---------|--------|
| `INCIDENT_SERVICE` | `IncidentService` | ✅ integrado con SN |
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
API_GATEWAY_URL=http://localhost:3000       # Gateway para outbound SN
INTERNAL_API_TOKEN=xxx                      # Token de comunicación interna
SN_DEFAULT_COMPANY_SYS_ID=xxx              # Fallback sys_id de empresa en ServiceNow (campo company del ticket)
SN_DEFAULT_COMPANY_ID=xxx                  # Fallback company_id interno para buscar CompanyIssueConfig de grupos resolutores
```

`SN_DEFAULT_COMPANY_ID` debe apuntar a una compañía que tenga `CompanyIssueConfig` para
todos los issue types activos. En desarrollo: `company-santander-default-001`.

---

## Tabla de repos y tokens

| Token | Repositorio | Tabla DB |
|-------|-------------|----------|
| `CORNER_REPOSITORY` | `TypeOrmCornerRepository` | `corners` |
| `CORNER_ISSUE_CONFIG_REPOSITORY` | `TypeOrmCornerIssueConfigRepository` | `corner_issue_configs` |
| `INCIDENT_REPOSITORY` | `TypeOrmIncidentRepository` | `incidents` |
| `DEVICE_REPOSITORY` | `TypeOrmDeviceRepository` | `devices` |
| `USER_REPOSITORY` | `TypeOrmUserRepository` | `users` |
| `SLOT_REPOSITORY` | `TypeOrmSlotRepository` | `corner_slots` |
| `ISSUE_TYPE_REPOSITORY` | `TypeOrmIssueTypeRepository` | `issue_types` |
| `COMPANY_REPOSITORY` | `TypeOrmCompanyRepository` | `companies` |

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
- `servicenow_category`: categoría en ServiceNow para crear INC/REQ
- `servicenow_close_category`: categoría al cerrar
- `device_type`: tipo de dispositivo asociado

### Incident
- `servicenow_id` + `servicenow_number`: vinculan con el ticket de SN
- `device_id`: FK al device resuelto (cache de Minerva)
- `correlation_id` en SN = `device.serialNumber`

### User
- `principal_name` (UPN): identificador unívoco para ServiceNow (`caller_id`)
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
  User.principalName ?? User.email ?? String(customerId)

Resolución de correlation_id:
  device.serialNumber (del comando de creación)
```

---

## API Interna (`/internal/*`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /internal/corners` | Listar corners activos |
| `GET /internal/availability` | Ventanas disponibles (requiere `duration`) |
| `POST /internal/incidents` | Crear incidente |
| `GET /internal/incidents/:id` | Obtener incidente |
| `GET /internal/devices/user/:customerId` | Dispositivos cacheados de un usuario |
| `GET /internal/devices/:serialNumber/resolve` | Resolver dispositivo desde Minerva |
