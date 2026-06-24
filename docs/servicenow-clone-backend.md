# servicenow-clone-backend — Simulador ServiceNow

Puerto: **3000**

Simula la Table API de ServiceNow. Genera `sys_id` (32 hex chars, sin guiones) y `number` con prefijo según el tipo de tabla. El almacenamiento es en memoria (se resetea al reiniciar).

## Prefijos de número por tabla

| Tabla ServiceNow | Prefijo | Ejemplo |
|---|---|---|
| `incident` | `INC` | `INC0000001` |
| `change_request` | `CHG` | `CHG0000001` |
| `sc_req_item` | `RITM` | `RITM0000001` |
| `sc_request` | `REQ` | `REQ0000001` |
| `sc_task` | `SCTASK` | `SCTASK0000001` |
| `problem` | `PRB` | `PRB0000001` |
| `kb_article` | `KB` | `KB0000001` |
| `release_task` | `RTASK` | `RTASK0000001` |
| `cmdb_ci` | `CI` | `CI0000001` |
| `task` | `TASK` | `TASK0000001` |
| cualquier otra | `TKT` | `TKT0000001` |

---

## Endpoints

Soporta dos prefijos de ruta equivalentes:
- `/api/now/v2/:tableName` — usado por `api-snowq-service`
- `/api/now/table/:tableName` — Table API estándar de ServiceNow

---

## Crear un registro

```
POST /api/now/v2/:tableName
POST /api/now/table/:tableName
```

### Incident

```bash
curl -s -X POST http://localhost:3000/api/now/v2/incident \
  -H "Content-Type: application/json" \
  -d '{
    "short_description": "Servidor de producción no responde",
    "description": "El servidor app-prod-01 dejó de responder a las 14:30",
    "urgency": "3",
    "impact": "3",
    "u_severity": "critical",
    "caller_id": "jperez",
    "category": "email",
    "contact_type": "phone"
  }' | jq
```

**Respuesta:**
```json
{
  "result": {
    "sys_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    "number": "INC0000001",
    "sys_class_name": "incident",
    "sys_created_on": "2026-03-13 10:30:00",
    "sys_updated_on": "2026-03-13 10:30:00",
    "short_description": "Servidor de producción no responde",
    "urgency": "3",
    "impact": "3"
  }
}
```

---

### Change Request

```bash
curl -s -X POST http://localhost:3000/api/now/v2/change_request \
  -H "Content-Type: application/json" \
  -d '{
    "short_description": "Actualización de firewall en zona DMZ",
    "description": "Cambio planificado de reglas de firewall",
    "urgency": "2",
    "impact": "2",
    "u_severity": "medium",
    "caller_id": "alopez",
    "reason": "Solicitado desde Thruk",
    "type": "normal",
    "risk": "2",
    "start_date": "2026-04-15 02:00:00",
    "end_date": "2026-04-15 03:00:00",
    "assignment_group": "sys_user_group.default",
    "requested_by": "alopez@example.com"
  }' | jq
```

**Respuesta:**
```json
{
  "result": {
    "sys_id": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
    "number": "CHG0000001",
    "sys_class_name": "change_request",
    "sys_created_on": "2026-03-13 10:31:00",
    "sys_updated_on": "2026-03-13 10:31:00",
    "short_description": "Actualización de firewall en zona DMZ"
  }
}
```

---

### Service Catalog (sc_req_item)

```bash
curl -s -X POST http://localhost:3000/api/now/v2/sc_req_item \
  -H "Content-Type: application/json" \
  -d '{
    "request": "REQ0000001",
    "cat_item": "laptop_standard",
    "variables": {
      "color": "negro",
      "ram": "16GB",
      "storage": "512GB SSD"
    }
  }' | jq
```

**Respuesta:**
```json
{
  "result": {
    "sys_id": "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
    "number": "RITM0000001",
    "sys_class_name": "sc_req_item",
    "sys_created_on": "2026-03-13 10:32:00",
    "sys_updated_on": "2026-03-13 10:32:00"
  }
}
```

---

### Problem

```bash
curl -s -X POST http://localhost:3000/api/now/v2/problem \
  -H "Content-Type: application/json" \
  -d '{
    "short_description": "Caídas recurrentes en servicio de autenticación",
    "description": "El servicio de auth cae todos los lunes entre las 08:00 y 09:00",
    "urgency": "2",
    "impact": "2",
    "u_severity": "high",
    "caller_id": "mgarcia",
    "root_cause_analysis": "Posible memory leak en el proceso de token refresh",
    "priority": "2",
    "assignment_group": "sys_user_group.default"
  }' | jq
```

**Respuesta:**
```json
{
  "result": {
    "sys_id": "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
    "number": "PRB0000001",
    "sys_class_name": "problem",
    "sys_created_on": "2026-03-13 10:33:00",
    "sys_updated_on": "2026-03-13 10:33:00"
  }
}
```

---

### Knowledge Article (kb_article)

```bash
curl -s -X POST http://localhost:3000/api/now/v2/kb_article \
  -H "Content-Type: application/json" \
  -d '{
    "short_description": "Cómo resetear contraseña de VPN",
    "text": "Pasos para resetear la contraseña: 1) Ingresar al portal...",
    "category": "security",
    "workflow_state": "published",
    "kb_knowledge_base": "default_kb_sysid"
  }' | jq
```

**Respuesta:**
```json
{
  "result": {
    "sys_id": "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "number": "KB0000001",
    "sys_class_name": "kb_article",
    "sys_created_on": "2026-03-13 10:34:00",
    "sys_updated_on": "2026-03-13 10:34:00"
  }
}
```

---

### Release Task

```bash
curl -s -X POST http://localhost:3000/api/now/v2/release_task \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Deploy microservicio de pagos v2.1",
    "description": "Despliegue de nueva versión del microservicio de pagos",
    "start_date": "2026-04-10 09:00:00",
    "end_date": "2026-04-10 11:00:00",
    "assigned_to": "devops_team",
    "release": "REL0010001"
  }' | jq
```

**Respuesta:**
```json
{
  "result": {
    "sys_id": "f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    "number": "RTASK0000001",
    "sys_class_name": "release_task",
    "sys_created_on": "2026-03-13 10:35:00",
    "sys_updated_on": "2026-03-13 10:35:00"
  }
}
```

---

### Configuration Item (cmdb_ci)

```bash
curl -s -X POST http://localhost:3000/api/now/v2/cmdb_ci \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-prod-01",
    "ip_address": "10.0.1.50",
    "manufacturer": "Dell",
    "model_number": "PowerEdge R750",
    "operational_status": "1",
    "install_status": "100",
    "support_group": "infra_team"
  }' | jq
```

**Respuesta:**
```json
{
  "result": {
    "sys_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d5",
    "number": "CI0000001",
    "sys_class_name": "cmdb_ci",
    "sys_created_on": "2026-03-13 10:36:00",
    "sys_updated_on": "2026-03-13 10:36:00"
  }
}
```

---

## Consultar registros

### Listar todos los registros de una tabla

```bash
curl -s http://localhost:3000/api/now/v2/incident | jq
```

### Obtener un registro por sys_id

```bash
curl -s http://localhost:3000/api/now/v2/incident/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4 | jq
```

### Actualizar un registro (PATCH)

```bash
curl -s -X PATCH http://localhost:3000/api/now/v2/incident/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4 \
  -H "Content-Type: application/json" \
  -d '{"state": "resolved", "close_notes": "Servidor reiniciado exitosamente"}' | jq
```
