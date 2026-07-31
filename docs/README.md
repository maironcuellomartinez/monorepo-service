# Workspace — Documentación General

> ⚠️ **Doc parcialmente superada.** Describe una arquitectura previa al refactor de 2026-07-09
> (ver nota en `PENDIENTES.md`) y al remodelado `Incident`/`Request` → `Appointment` de 2026-07.
> La carpeta `broker-queue-lite` mencionada abajo **ya no existe en el workspace** — no se pudo
> verificar aquí si fue removida del flujo o reemplazada por otra cosa; no se corrigió ese punto
> por estar fuera del alcance de esta pasada (terminología de dominio). Fuente de verdad actual:
> `monolito-event-corner_v3/docs/documentation.md` e `infrastructure-diagram.md`.

## Servicios

| Servicio | Puerto | Descripción |
|---|---|---|
| `servicenow-clone-backend` | `3000`\* | Simulador de la API de ServiceNow — \*CLAUDE.md (raíz) documenta `3010`; no verificado cuál es el vigente |
| `api-snowq-service` | `3090` | Gateway de procesamiento de solicitudes |
| `broker-queue-lite` | `5000` (HTTP) / `8000` (TCP) | Broker de mensajería interno — **carpeta no encontrada en el workspace actual**, posiblemente removido |
| `monolito-event-corner_v3 / monolith` | — | Monolito de negocio (gestión de citas — `Appointment`, unifica lo que antes eran `Incident`/`Request`) |
| `monolito-event-corner_v3 / api-gateway` | — | Gateway HTTP del monolito |

## Documentación por servicio

- [servicenow-clone-backend](./servicenow-clone-backend.md) — Simulador ServiceNow
- [api-snowq-service](./api-snowq-service.md) — API Gateway (inmediato + async)
- [broker-queue-lite](./broker-queue-lite.md) — Broker de mensajería

---

## Arquitectura y flujo completo

### Visión de alto nivel

```
┌─────────────────────────────────────────────────────────────┐
│                  monolito-event-corner_v3                   │
│                                                             │
│   ┌──────────────┐        ┌──────────────────────────────┐  │
│   │  api-gateway │        │          monolith            │  │
│   │              │        │                              │  │
│   │  (HTTP in)   │◄──────►│  Dominio: Appointment,       │  │
│   │  SnowqAdapter│        │  ServiceNowTicketLink        │  │
│   │              │        │  Outbox Pattern              │  │
│   └──────┬───────┘        │  OutboxWorker + Handlers     │  │
│          │                │  ReconcilerJob               │  │
└──────────┼────────────────┴──────────────────────────────┘──┘
           │ SNOWQ_URL
           ▼
   ┌───────────────────┐
   │  api-snowq-service │  puerto 3090
   │  (modo inmediato   │
   │   o async/queue)   │
   └───────┬───────┬───┘
           │       │ broker-queue-lite TCP :8000
     sync  │       ▼
           │  ┌────────────────────┐
           │  │  broker-queue-lite │  puerto 5000/8000
           │  │  (colas por prio.) │
           │  └────────┬───────────┘
           │           │ consume
           │           ▼
           │  api-snowq-service (workers)
           │           │
           └───────────┤
                       ▼
          ┌─────────────────────────────┐
          │  servicenow-clone-backend   │  puerto 3000
          │  (simulador Table API)      │
          └─────────────────────────────┘
```

---

## El problema que este diseño resuelve

ServiceNow es un sistema externo que **puede estar caído**. Cuando eso ocurre, cada intento fallido de crear un ticket se pierde si no hay una estrategia de reintentos robusta.

Además, hay escenarios donde el monolito **no puede esperar** la respuesta de ServiceNow (flujos síncronos críticos) y otros donde **puede tolerar el delay** (colas async con respuesta diferida).

El diseño implementado resuelve ambos escenarios con tres capas de resiliencia:

1. **Outbox Pattern** (monolith) — garantiza que ningún evento de dominio se pierda
2. **api-snowq-service** — absorbe la variabilidad de ServiceNow con circuit-breaker, bulkhead y colas de prioridad
3. **ReconcilerJob** (monolith) — reconcilia los tickets creados en modo async

---

## Capa 1 — Outbox Pattern en el monolito

### ¿Qué es el Outbox Pattern?

Es una técnica para garantizar **entrega at-least-once** de eventos de dominio. En lugar de publicar el evento al bus directamente (lo que podría perderse si el
proceso cae entre la escritura en DB y la publicación), el evento se **persiste en la misma transacción** que el agregado de negocio. Un worker separado lo lee
y lo despacha.

```
Operación de negocio
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  TRANSACCIÓN DE BASE DE DATOS            │
  │                                          │
  │  1. INSERT INTO incidents (...)          │
  │  2. INSERT INTO outbox_events (...)      │  ← evento guardado aquí
  └─────────────────────────────────────────┘
        │
        │  (5 segundos después)
        ▼
  OutboxWorkerService
        │
        ▼
  Despacha al InMemoryEventBus
        │
        ▼
  AppointmentServiceNowHandler
        │
        ▼
  api-gateway → api-snowq-service → servicenow-clone-backend
```

### Tabla `outbox_events`

| Columna | Descripción |
|---|---|
| `event_id` | UUID del evento |
| `event_type` | `APPOINTMENT_CREATED`, etc. (evento único — ya no hay REQUEST_CREATED separado) |
| `aggregate_id` | ID de la cita |
| `payload` | Datos del evento (JSON) |
| `published_at` | Fecha de publicación exitosa; `NULL` = pendiente |
| `created_at` | Fecha de creación |
| `retry_count` | Número de intentos realizados |
| `max_retries` | Límite de intentos (default: 3) |
| `last_error` | Último mensaje de error capturado |
| `retry_after` | Próximo intento no antes de esta fecha (backoff exponencial) |
| `failed_at` | Fecha en que se agotaron los reintentos; evento en "DLQ lógica" |

### Ciclo de vida de un evento en el outbox

```
Evento creado
     │
     │  published_at = NULL
     │  retry_count  = 0
     │  failed_at    = NULL
     ▼
OutboxWorker lo recoge
     │
     ├─► ÉXITO ──────────────────► published_at = NOW()   ✓ Fin
     │
     └─► ERROR
           │
           │  retry_count++
           │  last_error = mensaje
           │  retry_after = NOW() + 2^retry_count * 5s   ← backoff exponencial
           │
           ├─► retry_count < max_retries
           │         │
           │         │  (espera el backoff)
           │         └─► vuelve al worker en próximo ciclo
           │
           └─► retry_count >= max_retries
                     │
                     ▼
               failed_at = NOW()   ← "DLQ lógica", no se reintenta más
```

**Tabla de delays con backoff (max_retries = 3):**

| Intento | Delay antes del próximo reintento |
|---|---|
| 1 | 2¹ × 5s = 10 segundos |
| 2 | 2² × 5s = 20 segundos |
| 3 | 2³ × 5s = 40 segundos → `failed_at` |

### ¿Por qué los handlers ahora re-lanzan excepciones?

**Antes (bug):** El handler capturaba el error, logueaba y retornaba. El worker
no sabía que había fallado y marcaba el evento como `published_at = NOW()`. El
ticket se perdía para siempre.

**Después (fix):** El handler re-lanza la excepción en los casos críticos. El
worker la captura en su propio `try/catch`, aplica el backoff y NO marca el
evento como publicado. En el próximo ciclo, el evento se vuelve a intentar.

```typescript
// ANTES — evento silenciosamente perdido
if (result.isFailure) {
    this.logger.error('...');
    return;  // ← el worker no sabe que falló
}

// DESPUÉS — el worker puede registrar el reintento
if (result.isFailure) {
    this.logger.error('...');
    throw new Error('...');  // ← el worker lo captura y aplica backoff
}
```

> **Regla:** Solo se re-lanza en fallos **recuperables** (ServiceNow caído,
> error de red). Los fallos de **datos** (entidad no encontrada, usuario sin
> compañía) no se re-lanzan porque ningún reintento los va a resolver.

---

## Capa 2 — api-snowq-service como gateway inteligente

### ¿Por qué no ir directo a ServiceNow?

Ir directo a ServiceNow desde el monolito implica:
- Depender de la disponibilidad de ServiceNow en cada operación
- No tener control de la tasa de llamadas (rate limiting)
- No priorizar tickets urgentes sobre los menos importantes

`api-snowq-service` resuelve esto con:

| Mecanismo           | Qué hace                                                                                                       |
|---------------------|----------------------------------------------------------------------------------------------------------------|
| **Circuit Breaker** | Si ServiceNow falla repetidamente, abre el circuito y rechaza rápido (fail-fast) en lugar de acumular timeouts |
| **Bulkhead**        | Limita la concurrencia por prioridad, evitando que un pico sature todo el servicio                             |
| **Priority Queue**  | Los tickets CRITICAL se procesan antes que los LOW, independientemente del orden de llegada                    |
| **Broker (async)**  | Desacopla la recepción del procesamiento; el monolito recibe `202 Accepted` en microsegundos                   |

### Dos modos de operación

#### Modo inmediato
```
Monolito ──► POST /snow-requests/immediate/:type ──► api-snowq-service
                                                            │
                                                            ▼
                                                  servicenow-clone-backend
                                                            │
                                                            ▼
                                              ◄── { sys_id, snowNumber } ──
```
- Respuesta sincrónica con `sys_id` y `snowNumber`
- Útil cuando el monolito necesita el ID inmediatamente (ej. mostrar al usuario)

#### Modo async (queue)
```
Monolito ──► POST /snow-requests/:type ──► api-snowq-service
                                                  │
                                                  ▼
                                          broker-queue-lite
                                          (cola por prioridad)
                                                  │
                          ◄── 202 Accepted ───────┘
                          { correlationId, internalNumber }
                                                  │
                                    (procesamiento en background)
                                                  │
                                                  ▼
                                          api-snowq-service (worker)
                                                  │
                                                  ▼
                                          servicenow-clone-backend
```
- Respuesta inmediata con `correlationId` (UUID) e `internalNumber` (ej. `SNQ-550E8400`)
- El ticket se procesa en background según su prioridad
- El monolito puede consultar el estado con `GET /snow-requests/:correlationId`

### ¿Qué usa el api-gateway del monolito?

El **api-gateway** (dentro de `monolito-event-corner_v3`) contiene el
`SnowqAdapter`, que implementa `IServiceNowClient` y conecta el monolito con
`api-snowq-service`. Opera en **dos fases** para garantizar que ningún ticket
se pierda aunque ServiceNow esté caído.

```
Monolith Handler
      │
      ▼
ServiceNowIntegrationService
      │  usa IServiceNowClient (token: SERVICENOW_CLIENT)
      ▼
[api-gateway] SnowqAdapter
      │
      │  FASE 1 — POST /snow-requests/immediate/incidents
      ▼
api-snowq-service
      │
      ├─► ServiceNow DISPONIBLE ──► { sys_id, snowNumber, deferred: false }
      │
      └─► ServiceNow CAÍDO ──► error / circuit abierto
                │
                │  FASE 2 — POST /snow-requests/incidents (async fallback)
                ▼
        broker-queue-lite (cola)
                │
                ▼
        { correlationId, internalNumber, deferred: true }
```

### ¿Qué pasa cuando ServiceNow está caído?

Esta es la pregunta clave. El `SnowqAdapter` aplica una **estrategia en dos fases**:

**Fase 1 — Intento inmediato**

El adaptador llama a `POST /snow-requests/immediate/incidents`. `api-snowq-service`
intenta contactar a ServiceNow en tiempo real.

- Si ServiceNow responde → éxito, se retorna `{ sysId, snowNumber, deferred: false }`
- Si ServiceNow falla → el circuit breaker de `api-snowq-service` rechaza rápido
  y el adaptador **no retorna error todavía**, pasa a la Fase 2

**Fase 2 — Fallback a la cola async**

En lugar de fallar, el adaptador llama a `POST /snow-requests/incidents` (modo async).
El mensaje entra a `broker-queue-lite` con la prioridad correspondiente y se retorna
`{ correlationId, deferred: true }` de inmediato.

```
                   SnowqAdapter.createIncident()
                           │
                   ┌───────┴────────────┐
                   │                    │
            FASE 1: inmediato     (si falla)
                   │                    │
                   ▼             FASE 2: async
          SN disponible                 │
          { sysId, number }     { correlationId }
          deferred: false         deferred: true
```

La respuesta `deferred: true` activa el camino diferido en `ServiceNowIntegrationService`:
en lugar de llamar `updateServiceNowInfo()`, llama `setSnowqCorrelationId()`.
El `ReconcilerJob` se encargará de completar cuando ServiceNow vuelva.

**¿Cuándo sí falla definitivamente?**

Solo si **ambas fases fallan** (por ejemplo, `api-snowq-service` tampoco está disponible).
En ese caso el `SnowqAdapter` retorna `Result.err(...)`, el handler **re-lanza la excepción**
y el `OutboxWorkerService` aplica el backoff exponencial. El evento se reintentará
automáticamente hasta `max_retries` veces.

```
AMBAS FASES FALLAN
        │
        ▼
Handler re-lanza excepción
        │
        ▼
OutboxWorker: retry_count++, retry_after = NOW() + 2^n * 5s
        │
        │  (cuando retry_after vence)
        ▼
OutboxWorker vuelve a intentar (hasta max_retries = 3)
        │
        └─► Si max_retries agotado: failed_at = NOW() (requiere atención manual)
```

**Resumen de comportamiento por escenario:**

| Escenario | Resultado |
|---|---|
| ServiceNow OK | `deferred: false`, `sysId` y `snowNumber` disponibles al instante |
| ServiceNow caído, broker OK | `deferred: true`, ticket en cola — ReconcilerJob reconcilia cuando SN vuelve |
| ServiceNow caído, broker caído | Outbox reintenta con backoff hasta `max_retries` |
| Todo caído, `max_retries` agotado | `failed_at` en outbox — ticket requiere atención manual |

---

## Capa 3 — ReconcilerJob: modo diferido

> **Nota de nomenclatura (2026-07-31):** los ejemplos de código de esta sección y de
> "Actualización de tickets en ServiceNow" / "Cambio de estado en lote" más abajo usan la firma
> anterior a la unificación `Appointment` — `incident.updateServiceNowInfo()`,
> `incident.setSnowqCorrelationId()`, `incident.changeStatus()`, `incident.reopen()`. Hoy esa
> lógica de ticket vive en la entidad separada `ServiceNowTicketLink`
> (`link.resolveImmediate(sysId, number)`, `link.markDeferred(correlationId)`,
> `link.reconcileDelivered(sysId, number)`), y el agregado de dominio es `Appointment`
> (`appointment.changeStatus()`, `appointment.reopen()`). El flujo conceptual descrito (fases,
> backoff, reconciliación, batch) sigue siendo válido — solo cambiaron los nombres.

### ¿Cuándo se usa el modo diferido?

Cuando el `SnowqAdapter` activa el fallback async (ServiceNow caído, broker OK),
retorna `{ deferred: true, correlationId: "..." }`. El `sys_id` real todavía no
existe — llegará más tarde, cuando `api-snowq-service` procese el ticket de la cola.

El flujo de responsabilidades es el siguiente:

1. `SnowqAdapter` retorna `deferred: true` con el `correlationId`
2. **`ServiceNowIntegrationService`** detecta el flag y llama `incident.setSnowqCorrelationId(correlationId)` en lugar de `updateServiceNowInfo()`
3. El **handler** llama `incidentRepository.update(incident)` para persistir el `correlationId` y el evento queda marcado como publicado en el outbox
4. El `sys_id` llega más tarde — el `MonolithReconcilerJob` completa la reconciliación

> El handler **nunca ve** el flag `deferred`. Solo comprueba `incident.snowqCorrelationId`
> después del call para decidir qué logguear. Toda la lógica del flag vive en
> `ServiceNowIntegrationService`.

### Flujo completo del modo diferido

```
SnowqAdapter retorna { deferred: true, correlationId: "550e8400-..." }
          │
          ▼
  ServiceNowIntegrationService detecta deferred = true
          │
          ▼  (en lugar de updateServiceNowInfo)
  incident.setSnowqCorrelationId("550e8400-...")
          │
          ▼  (retorna Result.ok(undefined) al handler)
  Handler: incidentRepository.update(incident)
  ┌────────────────────────────────────────────┐
  │  DB incidents:                             │
  │    snowq_correlation_id = "550e8400-..."  │
  │    servicenow_id         = NULL            │
  │  DB outbox_events:                         │
  │    published_at = NOW()   ✓               │
  └────────────────────────────────────────────┘
          │
          │  (30 segundos después)
          ▼
  MonolithReconcilerJob.reconcile()
          │
          ▼
  findPendingSnowqReconciliation()
  ← WHERE snowq_correlation_id IS NOT NULL AND servicenow_id IS NULL
          │
          │  para cada pendiente:
          ▼
  GET /snow-requests/550e8400-...
          │
          ├─► status = QUEUED / IN_PROGRESS
          │         └─► esperar próximo ciclo (ServiceNow aún no lo procesó)
          │
          ├─► status = DELIVERED
          │         │
          │         ▼
          │   incident.updateServiceNowInfo(sysId, snowNumber)
          │   incident.setSnowqCorrelationId(null)
          │   incidentRepository.update(incident)
          │   ┌────────────────────────────────────────┐
          │   │  DB: snowq_correlation_id = NULL       │
          │   │      servicenow_id = "a1b2c3d4..."     │
          │   │      servicenow_number = "INC0000001"  │
          │   └────────────────────────────────────────┘
          │
          └─► status = FAILED
                    │
                    ▼
              incident.setSnowqCorrelationId(null)
              incidentRepository.update(incident)
              ← correlationId limpiado, log de error para revisión manual
```

### Columnas agregadas a la DB para soportar este flujo

**Tabla `servicenow_ticket_links`** (antes columnas inline en `incidents` y `requests`):

| Columna nueva          | Tipo          | Descripción                                                                                                                 |
|------------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------|
| `snowq_correlation_id` | `VARCHAR(36)` | UUID de api-snowq-service cuando el ticket fue encolado en modo async. `NULL` cuando ya fue reconciliado o nunca fue async. |

---

## Ciclo de vida completo — ejemplo de una cita

```
1. Usuario crea una cita en la app
         │
         ▼
2. Monolith persiste la cita + evento APPOINTMENT_CREATED en outbox
   ┌──────────────────────────────────────────────────────┐
   │  incidents:      incident_id = "inc-001"             │
   │                  status = "CREATED"                  │
   │                  servicenow_id = NULL                │
   │                                                      │
   │  outbox_events:  event_type = "APPOINTMENT_CREATED"     │
   │                  published_at = NULL                 │
   │                  retry_count = 0                     │
   └──────────────────────────────────────────────────────┘
         │
         │  (≤ 5 segundos)
         ▼
3. OutboxWorkerService lee el evento → despacha al InMemoryEventBus
         │
         ▼
4. AppointmentServiceNowHandler recibe el evento
         │
         ▼
5. Llama a ServiceNowIntegrationService → SnowqAdapter
         │
         ├─► CASO A: api-snowq-service responde inmediatamente
         │         │
         │         ▼
         │   { sys_id: "a1b2...", snowNumber: "INC0000001", deferred: false }
         │         │
         │         ▼
         │   incident.updateServiceNowInfo(sys_id, INC0000001)
         │   outbox_events.published_at = NOW()   ✓
         │   incidents.servicenow_id = "a1b2..."
         │
         ├─► CASO B: ServiceNow caído → SnowqAdapter usa fallback async
         │         │
         │         │   Fase 1 (inmediato) falla
         │         │   Fase 2 (async) llama POST /snow-requests/incidents
         │         ▼
         │   { correlationId: "550e...", deferred: true }
         │         │
         │         ▼  (ServiceNowIntegrationService detecta deferred=true)
         │   incident.setSnowqCorrelationId("550e...")
         │   outbox_events.published_at = NOW()   ✓  (el evento SÍ se marca como publicado)
         │   incidents.snowq_correlation_id = "550e..."
         │   incidents.servicenow_id = NULL       (todavía no disponible)
         │         │
         │         │  (ReconcilerJob, cada 30s — cuando ServiceNow vuelve)
         │         ▼
         │   GET /snow-requests/550e... → DELIVERED
         │   incidents.servicenow_id = "a1b2..."
         │   incidents.snowq_correlation_id = NULL
         │
         └─► CASO C: ServiceNow Y broker ambos caídos
                   │
                   │   Fase 1 (inmediato) falla
                   │   Fase 2 (async) también falla
                   ▼
             SnowqAdapter retorna Result.err(...)
             Handler re-lanza excepción
             outbox_events.published_at = NULL   (NO se marca — se reintentará)
             outbox_events.retry_count++
             outbox_events.retry_after = NOW() + backoff
                   │
                   │  (cuando retry_after vence, vuelve al paso 3)
                   │  (si max_retries agotado → failed_at = NOW(), atención manual)
                   └─► vuelve al paso 3
```

---

## Actualización de tickets en ServiceNow — cierre y reapertura

### El handler `AppointmentStatusChangedHandler`

Cuando un técnico cambia el estado de una cita (ya sea individualmente o en lote),
el dominio publica uno de estos dos eventos:

| Evento | Cuándo se publica | Quién lo publica |
|---|---|---|
| `APPOINTMENT_STATUS_CHANGED` | Al llamar `incident.changeStatus()` | Cualquier transición vía máquina de estados |
| `APPOINTMENT_REOPENED` | Al llamar `incident.reopen()` | Solo transición `CLOSED → REOPENED` |

El `AppointmentStatusChangedHandler` escucha ambos eventos y decide qué llamar en ServiceNow:

```
APPOINTMENT_STATUS_CHANGED (newStatus = CLOSED)
          │
          ▼
¿tiene servicenow_id?
          │
          ├─► SÍ → snService.closeTicket(sysId, closeCategory, closeNotes)
          │
          └─► NO → skip (el ticket fue encolado en modo async — todavía sin sysId)
                        ← el sysId llegará por ReconcilerJob; el cierre en SN quedará pendiente

APPOINTMENT_REOPENED
          │
          ▼
¿tiene servicenow_id?
          │
          ├─► SÍ → snService.updateTicket('incident', sysId, { state: '2', work_notes: reason })
          │
          └─► NO → skip
```

> **¿Por qué solo reacciona al estado CLOSED y no a todos?**
> Las transiciones intermedias (IN_PROGRESS, PENDING_SPARE_PART, etc.) son estados
> internos del monolito sin representación directa en ServiceNow. Solo el cierre y la
> reapertura tienen impacto observable en el ticket de SN.

### Máquina de estados de la cita

Las transiciones válidas definen qué estados puede alcanzar una cita y por qué camino:

```
              CREATED
                 │
                 ▼
             DELIVERED
                 │
                 ▼
            IN_PROGRESS ◄────────────────────────────────────┐
           /      |      \                                   │
          ▼       ▼       ▼                                  │
   PENDING_     PENDING_  PENDING_                           │
   THIRD_PARTY  USER      SPARE_PART                         │
          \       │       /                                  │
           └──────┴───────┘                                  │
                 │                                           │
         ┌───────┴───────────────┐                           │
         ▼                       ▼                           │
  PENDING_PICKUP    PENDING_REPLACEMENT_DELIVERY             │
         │                       │                           │
         └───────────┬───────────┘                           │
                     ▼                                       │
                   CLOSED ─── reopen() ────► REOPENED  ──────┘
                     │
                validate()
                     │
                     ▼
                 VALIDATED  (terminal)

CANCELED  (terminal, alcanzable desde CREATED)
```

---

## Cambio de estado en lote

### ¿Por qué un endpoint de lote?

Un técnico que cierra un turno puede acumular 20 o más citas resueltas
que necesitan ser registradas en ServiceNow. Llamar `PATCH /:id/status` veinte
veces desde el cliente implica veinte round-trips HTTP y exposición a fallos
parciales sin un resumen claro.

El endpoint `POST /api/appointments/batch-status` acepta todas en una sola llamada,
procesa cada una independientemente y devuelve un resumen con exactamente qué
sucedió con cada una.

### Endpoint

```
POST /internal/appointments/batch-status
```

**Body:**
```json
{
  "items": [
    {
      "appointmentId": "uuid-1",
      "targetStatus": "CLOSED",
      "technicianId": "tech-001",
      "closeCategory": "resolved",
      "comment": "Pantalla reemplazada correctamente"
    },
    {
      "appointmentId": "uuid-2",
      "targetStatus": "CLOSED",
      "technicianId": "tech-001",
      "closeCategory": "resolved"
    },
    {
      "appointmentId": "uuid-3",
      "targetStatus": "REOPENED",
      "technicianId": "tech-001",
      "reason": "Cliente reporta que el problema persiste"
    },
    {
      "appointmentId": "uuid-4",
      "targetStatus": "IN_PROGRESS",
      "technicianId": "tech-002"
    }
  ]
}
```

**Campos por ítem:**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `appointmentId` | string (UUID) | Sí | ID de la cita |
| `targetStatus` | `AppointmentStatus` | Sí | Estado destino |
| `technicianId` | string | Sí | Técnico que ejecuta la acción |
| `comment` | string | No | Nota libre (aparece en el evento y en SN) |
| `closeCategory` | string | Condicional | Requerido si `targetStatus === CLOSED` |
| `reason` | string | Condicional | Requerido si `targetStatus === REOPENED` |

**Response (200 OK):**
```json
{
  "processed": 3,
  "skipped": 0,
  "failed": 1,
  "errors": [
    {
      "appointmentId": "uuid-3",
      "reason": "Invalid transition: IN_PROGRESS → REOPENED (must be CLOSED)"
    }
  ]
}
```

**Campos de la respuesta:**

| Campo | Descripción |
|---|---|
| `processed` | Citas guardadas y evento publicado al Outbox — SN se notifica de forma asíncrona |
| `skipped` | Citas que ya estaban en el estado destino — skip silencioso, sin error |
| `failed` | Citas con error de datos que no se procesaron |
| `errors` | Detalle de los fallos: `appointmentId` + mensaje de por qué falló |

### Reglas de procesamiento del lote

**1. Duplicados en el mismo lote**

Si el mismo `appointmentId` aparece dos veces en el array, el segundo ítem se marca
como `failed` de inmediato:

```json
{ "appointmentId": "uuid-1", "reason": "Duplicate appointmentId in batch" }
```

**2. Idempotencia**

Si una cita ya está en el estado destino, se cuenta como `skipped`.
No se genera ningún error ni se emite ningún evento. Permite reintentar el
mismo lote con seguridad si hubo un error de red en el cliente.

**3. Fallos independientes**

Cada ítem del lote falla o tiene éxito de forma independiente. Un fallo en el
ítem 3 no revierte ni bloquea los ítems 4, 5, 6...

**4. Routing por tipo de transición**

El servicio enruta internamente según el estado destino:

```
targetStatus === REOPENED
    └─► incident.reopen(reason)
          └─► publica APPOINTMENT_REOPENED

targetStatus === cualquier otro
    └─► incident.changeStatus(targetStatus, technicianId, comment, closeCategory)
          └─► publica APPOINTMENT_STATUS_CHANGED
```

### Flujo completo: 20 citas cerradas en lote

```
Técnico hace POST /internal/appointments/batch-status
con 20 items { targetStatus: "CLOSED", closeCategory: "resolved" }
         │
         ▼
AppointmentService.batchChangeStatus(items)
         │
         │  Para cada item (independientemente):
         ├─► Cargar cita desde DB
         ├─► Validar transición (la máquina de estados filtra las inválidas)
         ├─► incident.changeStatus(CLOSED, technicianId, comment, closeCategory)
         │       └─► publica APPOINTMENT_STATUS_CHANGED con { newStatus: CLOSED, closeCategory }
         ├─► incidentRepository.save(incident)
         └─► eventBus.publishMany(events)
               └─► OutboxEventBusAdapter: INSERT INTO outbox_events
         │
         ▼  (respuesta inmediata)
{ processed: 19, skipped: 0, failed: 1, errors: [...] }
         │
         │  (≤ 5 segundos después, por cita)
         ▼
OutboxWorkerService lee cada evento APPOINTMENT_STATUS_CHANGED
         │
         ▼
InMemoryEventBus despacha a AppointmentStatusChangedHandler
         │
         ▼
handler: newStatus === CLOSED → snService.closeTicket(sysId, closeCategory, closeNotes)
         │
         ├─► CASO A: ServiceNow OK
         │         └─► Ticket cerrado en SN al instante
         │
         └─► CASO B: ServiceNow caído
                   └─► closeTicket falla → handler re-lanza excepción
                         └─► OutboxWorker: retry_count++, retry_after += backoff
                               └─► Reintento automático cuando SN vuelva
```

### Comparativa: operación individual vs lote

| Aspecto | `PATCH /:id/status` | `POST /batch-status` |
|---|---|---|
| Citas por llamada | 1 | N (sin límite fijo) |
| Tipos de transición | Cualquiera | Cualquiera (heterogéneo) |
| Respuesta | Cita actualizada | Resumen `{ processed, skipped, failed, errors }` |
| Fallos parciales | N/A (una sola) | Reportados ítem a ítem — los demás continúan |
| Duplicados en lote | N/A | Rechazados con error explicativo |
| Idempotencia | Falla si ya en ese estado | Skip silencioso |
| Notificación a SN | Asíncrona vía Outbox | Asíncrona vía Outbox (idéntico) |
| `closeCategory` | Opcional en body | Opcional por ítem |

> El endpoint individual continúa funcionando exactamente igual que antes.
> El lote es un camino paralelo que reutiliza la misma lógica de dominio,
> el mismo Outbox y los mismos handlers.

---

## Flujo general (versión simplificada)

```
Cliente externo
  │
  ├── POST /snow-requests/immediate/:type   (respuesta sincrónica)
  │         └─► api-snowq-service
  │                   └─► servicenow-clone-backend
  │                             └─► { sys_id, number }
  │
  └── POST /snow-requests/:type             (respuesta 202 Accepted)
            └─► api-snowq-service
                      └─► broker-queue-lite (publica mensaje)
                                └─► api-snowq-service (consumer worker)
                                          └─► servicenow-clone-backend
                                                    └─► { sys_id, number }
```

---

## Variables de entorno requeridas

### api-snowq-service
```env
BASE_URL_SERVICENOW=http://localhost:3000
SN_AUTH=<base64 user:password>
BROKER_HOST=127.0.0.1
BROKER_PORT=8000
HOST_DATABASE=localhost
PORT_DATABASE=3306
USERNAME_DATABASE=root
PASSWORD_DATABASE=
DATABASE_DATABASE=snowq
```

### servicenow-clone-backend
```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_NAME=servicenow_clone
PORT=3000
```

### broker-queue-lite
```env
HTTP_PORT=5000
TCP_PORT=8000
NODE_ENV=development
```

### api-gateway (monolito-event-corner_v3)
```env
SNOWQ_URL=http://localhost:3090
SERVICENOW_SIMULATOR_URL=http://localhost:3000
```

### monolith (monolito-event-corner_v3)
```env
SNOWQ_URL=http://localhost:3090
```
