# api-snowq-service — API Gateway

Puerto: **3090**

Gateway que recibe solicitudes y las envía a ServiceNow (o al simulador). Soporta dos modos de operación:

- **Inmediato** — respuesta sincrónica con `sys_id` y `snowNumber`
- **Async (queue)** — publica en el broker, responde `202 Accepted` con `correlationId`

---

## DTO base

Todos los endpoints aceptan el mismo body:

```json
{
  "severity": "critical | high | medium | low",
  "impact": 1,
  "urgency": 1,
  "priority": 4,
  "source": "string",
  "payload": {}
}
```

| Campo | Tipo | Valores | Descripción |
|---|---|---|---|
| `severity` | string | `critical`, `high`, `medium`, `low` | Severidad |
| `impact` | number | `1` bajo, `2` medio, `3` alto | Impacto |
| `urgency` | number | `1` bajo, `2` medio, `3` alto | Urgencia |
| `priority` | number | `1` LOW, `2` MEDIUM, `3` HIGH, `4` CRITICAL | Prioridad para la cola interna |
| `source` | string | — | Sistema origen de la solicitud |
| `payload` | object | — | Datos específicos del tipo de solicitud |

---

## Modo inmediato — `POST /snow-requests/immediate/:type`

Respuesta sincrónica. Envía directamente a ServiceNow/simulador y retorna el resultado.

### Incident

```bash
curl -s -X POST http://localhost:3090/snow-requests/immediate/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "critical",
    "impact": 3,
    "urgency": 3,
    "priority": 4,
    "source": "monitoring-thruk",
    "payload": {
      "short_description": "Servidor de producción no responde",
      "description": "El servidor app-prod-01 dejó de responder a las 14:30",
      "assignmentGroup": "infra_team"
    }
  }' | jq
```

**Respuesta `200 OK`:**
```json
{
  "sys_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "snowNumber": "INC0000001"
}
```

---

### Change Request

```bash
curl -s -X POST http://localhost:3090/snow-requests/immediate/change-requests \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "medium",
    "impact": 2,
    "urgency": 2,
    "priority": 2,
    "source": "change-mgmt-portal",
    "payload": {
      "short_description": "Actualización de firewall DMZ",
      "assignmentGroup": "network_team",
      "requestedBy": "alopez@example.com",
      "startDate": "2026-04-15 02:00:00",
      "endDate": "2026-04-15 03:00:00"
    }
  }' | jq
```

---

### Problem

```bash
curl -s -X POST http://localhost:3090/snow-requests/immediate/problems \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "high",
    "impact": 2,
    "urgency": 2,
    "priority": 3,
    "source": "monitoring-thruk",
    "payload": {
      "short_description": "Caídas recurrentes en autenticación",
      "rootCause": "Memory leak en token refresh",
      "assignmentGroup": "app_team"
    }
  }' | jq
```

---

### Service Catalog

```bash
curl -s -X POST http://localhost:3090/snow-requests/immediate/service-catalog \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "low",
    "impact": 1,
    "urgency": 1,
    "priority": 1,
    "source": "self-service-portal",
    "payload": {
      "requestId": "REQ0000001",
      "catalogItemId": "laptop_standard",
      "variables": {
        "ram": "16GB",
        "storage": "512GB SSD"
      }
    }
  }' | jq
```

---

### Knowledge Article

```bash
curl -s -X POST http://localhost:3090/snow-requests/immediate/knowledge-articles \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "low",
    "impact": 1,
    "urgency": 1,
    "priority": 1,
    "source": "knowledge-portal",
    "payload": {
      "short_description": "Cómo resetear contraseña de VPN",
      "content": "Pasos para resetear la contraseña: 1) Ingresar al portal...",
      "category": "security",
      "kbKnowledgeBase": "default_kb_sysid"
    }
  }' | jq
```

---

### Release Task

```bash
curl -s -X POST http://localhost:3090/snow-requests/immediate/release-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "high",
    "impact": 3,
    "urgency": 2,
    "priority": 3,
    "source": "release-mgmt",
    "payload": {
      "name": "Deploy microservicio pagos v2.1",
      "description": "Despliegue de nueva versión",
      "startDate": "2026-04-10 09:00:00",
      "endDate": "2026-04-10 11:00:00",
      "assignedTo": "devops_team",
      "releaseId": "REL0010001"
    }
  }' | jq
```

---

### Configuration Item

```bash
curl -s -X POST http://localhost:3090/snow-requests/immediate/configuration-items \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "medium",
    "impact": 2,
    "urgency": 2,
    "priority": 2,
    "source": "cmdb-sync",
    "payload": {
      "name": "app-prod-01",
      "ipAddress": "10.0.1.50",
      "manufacturer": "Dell",
      "model": "PowerEdge R750",
      "operationalStatus": "1",
      "installStatus": "100",
      "supportGroup": "infra_team"
    }
  }' | jq
```

---

## Modo async (queue) — `POST /snow-requests/:type`

Publica en el broker y retorna `202 Accepted` inmediatamente. El procesamiento ocurre en background.

### Incident

```bash
curl -s -X POST http://localhost:3090/snow-requests/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "critical",
    "impact": 3,
    "urgency": 3,
    "priority": 4,
    "source": "monitoring-thruk",
    "payload": {
      "short_description": "Caída total de red en datacenter",
      "assignmentGroup": "network_team"
    }
  }' | jq
```

**Respuesta `202 Accepted`:**
```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "internalNumber": "SNQ-550E8400"
}
```

### Change Request

```bash
curl -s -X POST http://localhost:3090/snow-requests/change-requests \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "medium",
    "impact": 2,
    "urgency": 2,
    "priority": 2,
    "source": "change-mgmt-portal",
    "payload": {
      "short_description": "Migración de base de datos a nuevo servidor",
      "startDate": "2026-05-01 22:00:00",
      "endDate": "2026-05-02 02:00:00",
      "assignmentGroup": "dba_team"
    }
  }' | jq
```

### Problem

```bash
curl -s -X POST http://localhost:3090/snow-requests/problems \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "high",
    "impact": 2,
    "urgency": 2,
    "priority": 3,
    "source": "monitoring-thruk",
    "payload": {
      "short_description": "Latencia elevada en API de pagos",
      "rootCause": "Por investigar",
      "assignmentGroup": "backend_team"
    }
  }' | jq
```

### Service Catalog

```bash
curl -s -X POST http://localhost:3090/snow-requests/service-catalog \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "low",
    "impact": 1,
    "urgency": 1,
    "priority": 1,
    "source": "self-service-portal",
    "payload": {
      "requestId": "REQ0000005",
      "catalogItemId": "vpn_access",
      "variables": { "duration": "6 meses" }
    }
  }' | jq
```

### Knowledge Article

```bash
curl -s -X POST http://localhost:3090/snow-requests/knowledge-articles \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "low",
    "impact": 1,
    "urgency": 1,
    "priority": 1,
    "source": "knowledge-portal",
    "payload": {
      "short_description": "Guía de onboarding para nuevos empleados",
      "content": "Bienvenido a la empresa...",
      "category": "hr"
    }
  }' | jq
```

### Release Task

```bash
curl -s -X POST http://localhost:3090/snow-requests/release-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "high",
    "impact": 3,
    "urgency": 2,
    "priority": 3,
    "source": "release-mgmt",
    "payload": {
      "name": "Rollback microservicio auth v1.8",
      "description": "Rollback de emergencia",
      "startDate": "2026-03-14 03:00:00",
      "endDate": "2026-03-14 04:00:00",
      "assignedTo": "devops_team"
    }
  }' | jq
```

### Configuration Item

```bash
curl -s -X POST http://localhost:3090/snow-requests/configuration-items \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "medium",
    "impact": 2,
    "urgency": 2,
    "priority": 2,
    "source": "cmdb-sync",
    "payload": {
      "name": "db-replica-02",
      "ipAddress": "10.0.2.30",
      "manufacturer": "HP",
      "model": "ProLiant DL380",
      "operationalStatus": "1",
      "supportGroup": "dba_team"
    }
  }' | jq
```

---

## Consultar estado de una solicitud async

```bash
curl -s http://localhost:3090/snow-requests/550e8400-e29b-41d4-a716-446655440000 | jq
```

**Respuesta:**
```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "internalNumber": "SNQ-550E8400",
  "type": "incident",
  "status": "DELIVERED",
  "sysId": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "snowNumber": "INC0000001",
  "createdAt": "2026-03-13T10:30:00.000Z",
  "updatedAt": "2026-03-13T10:30:05.000Z"
}
```

### Ciclo de vida del status

```
IN_PROGRESS → QUEUED → DELIVERED
                    └→ FAILED
```

| Status | Significado |
|---|---|
| `IN_PROGRESS` | Creado, pendiente de publicar al broker |
| `QUEUED` | Publicado en el broker exitosamente |
| `DELIVERED` | Enviado a ServiceNow, tiene `sysId` y `snowNumber` |
| `FAILED` | Error en el envío, el broker maneja retry/DLQ |

---

## Prioridades y procesamiento

### Cola global hacia ServiceNow

Existe una única `PQueue` con `concurrency=5` que controla todas las llamadas concurrentes hacia SN. Las tareas se despachan en orden de prioridad: mayor número sale antes.

| Tipo | Base | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|---|
| `incident` | 400 | **404** | 403 | 402 | 401 |
| `change_request` | 300 | 304 | 303 | 302 | 301 |
| `problem` | 200 | 204 | 203 | 202 | 201 |
| `sc_req_item` | 200 | 204 | 203 | 202 | 201 |
| `kb_article` | 100 | 104 | 103 | 102 | 101 |
| `release_task` | 100 | 104 | 103 | 102 | 101 |
| `cmdb_ci` | 100 | 104 | 103 | 102 | 101 |

Si hay `incident.LOW` (401) y `change_request.CRITICAL` (304) esperando slot, sale primero el `incident.LOW` porque 401 > 304. El tipo siempre domina sobre el nivel.

El `await` en el loop de polling hace que cada worker espere a que la tarea complete en SN antes de extraer el siguiente mensaje del broker — esto es el backpressure natural hacia el broker.

---

### Frecuencia de polling por tipo y prioridad

El polling del broker también está diferenciado por grupo de tipo:

**Grupo HIGH** — `incident`, `change_request`:

| Prioridad | Intervalo | Batch |
|---|---|---|
| CRITICAL | 500 ms | 10 |
| HIGH | 1 s | 8 |
| MEDIUM | 2 s | 5 |
| LOW | 5 s | 3 |

**Grupo MEDIUM** — `problem`, `sc_req_item`:

| Prioridad | Intervalo | Batch |
|---|---|---|
| CRITICAL | 1 s | 8 |
| HIGH | 2 s | 5 |
| MEDIUM | 5 s | 3 |
| LOW | 10 s | 2 |

**Grupo LOW** — `kb_article`, `release_task`, `cmdb_ci`:

| Prioridad | Intervalo | Batch |
|---|---|---|
| CRITICAL | 2 s | 5 |
| HIGH | 5 s | 3 |
| MEDIUM | 10 s | 2 |
| LOW | 30 s | 1 |

Si la cola tiene mensajes, el polling vuelve a ejecutarse inmediatamente (`setImmediate`) sin esperar el intervalo. El intervalo solo aplica cuando la cola está vacía.

---

### Retry delay por prioridad (broker → DLQ)

| Prioridad | Valor | Retry delay |
|---|---|---|
| `CRITICAL` | `4` | 5 seg |
| `HIGH` | `3` | 15 seg |
| `MEDIUM` | `2` | 30 seg |
| `LOW` | `1` | 60 seg |
