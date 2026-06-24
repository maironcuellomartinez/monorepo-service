# servicenow-clone-backend

Simulador local de la ServiceNow Table API. Replica el comportamiento de los endpoints
`/api/now/v2` y `/api/now/table` para que el ecosistema funcione en desarrollo sin
necesidad de acceso a una instancia real de ServiceNow.

Puerto: **3010**
Base de datos: `servicenow_clone` (MySQL)

---

## Para qué sirve

En producción/staging, `api-snowq-service` e `integration-service` apuntan a la instancia
real de ServiceNow. En desarrollo, apuntan a este simulador. El comportamiento es idéntico:
misma estructura de request/response, mismos códigos de estado numéricos, misma lógica de
numeración de tickets.

```
api-snowq-service  →  POST /api/now/v2/:table       →  servicenow-clone-backend :3010
api-gateway        →  PATCH /api/now/v2/:table/:id  →  servicenow-clone-backend :3010
integration-service →  POST/PATCH /api/now/table/incident →  servicenow-clone-backend :3010
```

---

## Arranque

```bash
cd servicenow-clone-backend
npm install
npm run start:dev
```

Variables de entorno (`.env`):

| Variable        | Default            | Descripción              |
|-----------------|--------------------|--------------------------|
| `PORT`          | `3010`             | Puerto del servidor      |
| `DB_HOST`       | `localhost`        | Host MySQL               |
| `DB_PORT`       | `3306`             | Puerto MySQL             |
| `DB_USERNAME`   | `root`             | Usuario MySQL            |
| `DB_PASSWORD`   | `root`             | Contraseña MySQL         |
| `DB_NAME`       | `servicenow_clone` | Base de datos            |
| `NODE_ENV`      | —                  | Si es `production`, deshabilita `synchronize` |

El schema (`sn_tickets`) se crea automáticamente al arrancar (`synchronize: true` en dev).

---

## Seed (primera vez)

```bash
npm run seed
```

Pobla la tabla `sn_tickets` con registros de referencia que imitan tablas core de ServiceNow:

**`core_company` — empresas:**

| Nombre | `sys_id` |
|---|---|
| Santander Argentina | `4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b` |
| Santander España | `7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d` |
| Santander Corporate (Default) | `c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8` |

**`sys_user_group` — grupos resolutores:**

| Nombre                      | `sys_id`                             |
|-----------------------------|--------------------------------------|
| Soporte IT General          | `group001itsupportgeneral00000001`   |
| Soporte Redes               | `group002networksupport0000000001`   |
| Soporte Hardware            | `group003hardwaresupport000000001`   |
| Soporte Software            | `group004softwaresupport000000001`   |
| Soporte Corner Buenos Aires | `group005cornerba0000000000000001`   |
| Soporte Corner Madrid       | `group006cornermad000000000000001`   |

Estos `sys_id` son los que deben configurarse en el monolith:
- `servicenow_profiles.snow_company_sys_id` → `sys_id` de la empresa
- `corners.snow_assignment_group` → `sys_id` del grupo resolutor
- `SN_DEFAULT_COMPANY_SYS_ID=c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8` en `apps/monolith/.env.*`

El seed es idempotente — si ya existen registros de referencia, no hace nada.

---

## API

Todos los endpoints siguen la estructura de respuesta de ServiceNow:

```json
{ "result": { ... } }        // GET/POST/PATCH con un registro
{ "result": [ ... ] }        // GET lista
```

### `POST /api/now/v2/:tableName` y `POST /api/now/table/:tableName`

Crea un ticket nuevo. El `sys_id` y el número se generan automáticamente.

**Request body** — cualquier campo SN válido:

```json
{
  "short_description": "Teclado no responde",
  "category": "hardware",
  "urgency": "2",
  "impact": "2",
  "caller_id": "usuario@empresa.com",
  "company": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
  "assignment_group": "group003hardwaresupport000000001",
  "location": "ARG-BA-001"
}
```

**Response `201`:**

```json
{
  "result": {
    "sys_id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "number": "INC0000001",
    "sys_class_name": "incident",
    "state": "1",
    "state_label": "New",
    "sys_created_on": "2026-03-24 10:00:00",
    "sys_updated_on": "2026-03-24 10:00:00",
    "resolved_at": "",
    "close_code": "",
    "close_notes": "",
    "short_description": "Teclado no responde",
    ...
  }
}
```

---

### `GET /api/now/v2/:tableName` y `GET /api/now/table/:tableName`

Lista todos los tickets de una tabla, ordenados por fecha de creación descendente.

**Response `200`:** array de registros con la misma estructura que el POST.

---

### `GET /api/now/v2/:tableName/:sys_id` y `GET /api/now/table/:tableName/:sys_id`

Obtiene un ticket por `sys_id`. Retorna `404` si no existe.

---

### `PATCH /api/now/v2/:tableName/:sys_id` y `PATCH /api/now/table/:tableName/:sys_id`

Actualiza un ticket existente. El body se mergea al payload existente.

**Actualizar estado:**

```json
{ "state": "resolved" }
```

El campo `state` acepta tanto strings semánticos como códigos numéricos directos:

| Valor entrante | `incident` | `change_request` | `sc_req_item` / `sc_task` | `problem` |
|---|---|---|---|---|
| `"open"` / `"new"` | `"1"` | `"-5"` | `"1"` | `"1"` |
| `"in_progress"` | `"2"` | `"2"` | `"2"` | `"2"` |
| `"on_hold"` | `"3"` | `"3"` | `"3"` | `"3"` |
| `"resolved"` | `"6"` | `"0"` | `"3"` | `"4"` |
| `"closed"` | `"7"` | `"3"` | `"3"` | `"4"` |
| `"canceled"` | `"8"` | `"8"` | `"7"` | `"7"` |
| Código numérico | pass-through | pass-through | pass-through | pass-through |

Cuando el estado transiciona a un estado de cierre y `resolved_at` aún es null,
el simulador lo registra automáticamente.

**Cerrar con notas:**

```json
{
  "state": "closed",
  "close_code": "Solved (Permanently)",
  "close_notes": "Teclado reemplazado",
  "work_notes": "Se entregó equipo de reemplazo"
}
```

**Response `200`:** el ticket actualizado con el mismo formato que POST.

---

## Tablas soportadas y numeración

| Tabla | Prefijo | Estado inicial |
|---|---|---|
| `incident` | `INC` | `1` (New) |
| `sc_request` | `REQ` | — |
| `sc_req_item` | `RITM` | `1` (Open) |
| `sc_task` | `SCTASK` | `1` (Open) |
| `change_request` | `CHG` | `-5` (New) |
| `problem` | `PRB` | `1` (Open) |
| `kb_article` / `kb_knowledge` | `KB` | — |
| `release_task` | `RTASK` | — |
| `cmdb_ci` | `CI` | — |
| `task` | `TASK` | — |
| `u_request` | `REQ` | — |
| Cualquier otra | `TKT` | `1` |

Los números tienen padding de 7 dígitos: `INC0000001`, `CHG0000001`, etc.
La generación usa `SELECT MAX(number) ... FOR UPDATE` para evitar colisiones en accesos concurrentes.

---

## Códigos de estado por tabla

### `incident`

| Código | Label |
|---|---|
| `1` | New |
| `2` | In Progress |
| `3` | On Hold |
| `6` | Resolved |
| `7` | Closed |
| `8` | Canceled |

Estados de cierre: `6`, `7`

### `change_request`

| Código | Label |
|---|---|
| `-5` | New |
| `-4` | Assess |
| `-3` | Authorize |
| `-2` | Scheduled |
| `-1` | Implement |
| `0` | Review |
| `3` | Closed |

Estados de cierre: `0`, `3`

### `problem`

| Código | Label |
|---|---|
| `1` | Open |
| `2` | Known Error |
| `3` | Pending Change |
| `4` | Closed/Resolved |

Estado de cierre: `4`

### `sc_req_item` / `sc_task`

| Código | Label |
|---|---|
| `1` | Open |
| `2` | Work in Progress |
| `3` | Closed Complete |
| `4` | Closed Incomplete |
| `7` | Canceled |

Estados de cierre: `3`, `4`

---

## Entidad `sn_tickets`

Todos los tipos de ticket (incidents, changes, requests, etc.) se almacenan en la misma tabla MySQL `sn_tickets`. La columna `table_name` actúa como discriminador.

| Columna | Tipo | Descripción |
|---|---|---|
| `sys_id` | varchar(32) PK | UUID sin guiones (32 hex chars) |
| `number` | varchar(30) UNIQUE | Número legible: `INC0000001`, `CHG0000002`, etc. |
| `table_name` | varchar(60) | Tabla SN: `incident`, `change_request`, etc. |
| `state` | varchar(20) | Código numérico de estado |
| `payload` | json | Todos los campos enviados por el cliente (body completo) |
| `resolved_at` | datetime nullable | Fecha de cierre — null mientras está abierto |
| `created_at` | datetime | Auto |
| `updated_at` | datetime | Auto |

Los registros de referencia (`core_company`, `sys_user_group`) también se almacenan en esta
misma tabla con `state = 'active'` y su `sys_id` fijo.

---

## Módulo de tablas dinámicas (`/dynamic-tables`)

API de administración para registrar metadatos de tablas (no usada por los servicios
principales, disponible para tooling futuro):

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/dynamic-tables` | Registrar una tabla |
| `GET` | `/dynamic-tables` | Listar tablas registradas |
| `GET` | `/dynamic-tables/:id` | Detalle de una tabla |
| `PUT` | `/dynamic-tables/:id` | Actualizar metadatos |
| `DELETE` | `/dynamic-tables/:id` | Eliminar registro |

---

## Estructura del proyecto

```
src/
  servicenow-simulator/
    servicenow-simulator.controller.ts        ← @Controller('api/now/v2')  — usado por api-snowq-service y api-gateway
    servicenow-simulator-table.controller.ts  ← @Controller('api/now/table') — usado por integration-service
    servicenow-simulator.service.ts           ← lógica: create/findAll/findOne/update + mapeo de estados
    servicenow-simulator.module.ts
    snow-ticket.entity.ts                     ← tabla sn_tickets
  dynamic-tables/
    dynamic-tables.controller.ts
    dynamic-tables.service.ts
    dynamic-table.entity.ts
    dynamic-field.entity.ts
    dynamic.module.ts
  scripts/
    seed-reference-data.ts                    ← crea core_company y sys_user_group
  app.module.ts
  main.ts
```

---

## Consumers en el ecosistema

| Servicio | Ruta usada | Operaciones |
|---|---|---|
| `api-snowq-service` | `/api/now/v2/:table` | POST (crear ticket) |
| `api-gateway` | `/api/now/v2/:table/:sys_id` | PATCH (actualizar/cerrar), GET (leer estado) |
| `integration-service` | `/api/now/table/incident` | POST (crear), PATCH (actualizar), GET (leer) |

Para apuntar a este simulador configurar en cada servicio:

```env
# api-snowq-service
BASE_URL_SERVICENOW=http://localhost:3010

# api-gateway
SERVICENOW_SIMULATOR_URL=http://localhost:3010

# integration-service
SERVICENOW_BASE_URL=http://localhost:3010
```
