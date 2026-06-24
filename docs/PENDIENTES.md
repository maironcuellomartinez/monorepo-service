# Pendientes — Event Corner × ServiceNow

> Última actualización: 2026-03-13
> Sesión de referencia: infraestructura broker + polling prioritario + cola global SN

---

## ✅ Completado

### Capa Outbox (monolith)
- [x] Columnas de retry/backoff en `outbox_events` (`retry_count`, `max_retries`, `last_error`, `retry_after`, `failed_at`)
- [x] `OutboxWorkerService` con backoff exponencial — handlers re-lanzan para que el worker registre el reintento
- [x] `IncidentServiceNowHandler` — suscrito a `INCIDENT_CREATED`, crea ticket en SN
- [x] `RequestServiceNowHandler` — suscrito a `REQUEST_CREATED`, crea ticket en SN

### SnowqAdapter (api-gateway)
- [x] `SnowqAdapter` implementa `IServiceNowClient` con estrategia dos fases: inmediato → async fallback
- [x] `extractImmediateResult` / `extractDeferredResult`
- [x] `updateTicket` / `closeIncident` van directamente al simulador (SERVICENOW_SIMULATOR_URL)
- [x] `servicenow-outbound.module.ts` actualizado para usar `SnowqAdapter`

### Modo diferido + reconciliación (monolith)
- [x] `snowqCorrelationId` en dominio `Incident` y `Request` (getter + setter)
- [x] Columna `snowq_correlation_id` en TypeORM entities de `incidents` y `requests`
- [x] `findPendingSnowqReconciliation()` en repositorios de incidents y requests
- [x] `MonolithReconcilerJob` — `@Interval(30s)`, reconcilia tickets deferred contra api-snowq-service
- [x] `ServiceNowIntegrationService` detecta `deferred: true` internamente
- [x] `ServiceNowTicketResult` extendido con `deferred?` y `correlationId?` en el contrato compartido

### Ciclo de vida completo de estados (monolith)
- [x] `incident.changeStatus()` acepta `closeCategory?` y lo incluye en el payload del evento
- [x] `IncidentStatusChangedHandler` — suscrito a `INCIDENT_STATUS_CHANGED` (solo CLOSED) y `INCIDENT_REOPENED`
  - CLOSED → `snService.closeIncidentTicket(sysId, closeCategory, closeNotes)`
  - REOPENED → `snService.updateTicket('incident', sysId, { state: '2' })`

### Operación en lote (monolith)
- [x] `BatchStatusChangeItem` y `BatchChangeResult` en el port
- [x] `IIncidentService.batchChangeStatus()` implementado — idempotencia, duplicados, routing por tipo
- [x] `POST /internal/incidents/batch-status` en `InternalIncidentsController`
- [x] `PATCH /:id/status` actualizado para aceptar `closeCategory` (backwards compatible)

### api-snowq-service — Infraestructura del broker
- [x] `QueueInfrastructureService` reescrito con `OnModuleInit`
  - Declara exchange `snow.exchange` (topic, durable)
  - Declara DLQ compartida `dlq`
  - Declara y enlaza 28 colas de trabajo: `snow.{type}.{priority}` (7 tipos × 4 prioridades)
  - Opciones por cola: `durable`, `persistent`, `maxSize=1000`, `overflowPolicy=drop-head`, `deadLetterQueue=dlq`, `maxRetries=3`
- [x] `BrokerClientModule` agregado a `QueueModule` para proveer `BrokerClientService`

### api-snowq-service — Consumidor con polling continuo
- [x] Reemplazado consumo único por loop de polling continuo por cola (`startPollingQueue`)
  - Cola con mensajes → `setImmediate(poll)` (re-consume sin esperar)
  - Cola vacía → `setTimeout(poll, interval)` (espera según prioridad)
  - Error → `setTimeout(poll, interval)` (reintento con backoff)
- [x] `startConsumersInBackground()` — espera silenciosa hasta que el broker esté disponible
- [x] ACK/NACK manual (`autoAck=false`) — el broker gestiona retry y DLQ

### api-snowq-service — Polling diferenciado por tipo de solicitud
- [x] `getPollInterval(type, priority)` — matriz tipo × prioridad
  - Grupo HIGH (`incident`, `change_request`): CRITICAL=500ms … LOW=5s
  - Grupo MEDIUM (`problem`, `sc_req_item`): CRITICAL=1s … LOW=10s
  - Grupo LOW (`kb_article`, `release_task`, `cmdb_ci`): CRITICAL=2s … LOW=30s
- [x] `getBatchSize(type, priority)` — mismo criterio (HIGH: hasta 10, LOW: hasta 1)

### api-snowq-service — Cola global con despacho prioritario hacia SN
- [x] `PQueue` única global (`concurrency=5`) reemplaza las 4 PQueues independientes
- [x] Prioridad de despacho por tipo: `incident (400) > change_request (300) > problem/sc_req_item (200) > resto (100)` + offset por nivel (CRITICAL=4 … LOW=1)
- [x] `return this.snowQueue.add(...)` en `enqueue` — backpressure correcto, el polling espera que SN procese antes de extraer más mensajes del broker
- [x] `PQueue` eliminada de `SnowRequestQueueService` en su versión anterior (4 colas por nivel numérico)

### Documentación
- [x] `docs/README.md` — arquitectura completa, Outbox, api-snowq-service, ReconcilerJob
- [x] Sección de batch en la documentación — endpoint, campos, reglas, flujo completo, tabla comparativa
- [x] Sección de `IncidentStatusChangedHandler` y máquina de estados
- [x] `docs/api-snowq-service.md` — sección de prioridades actualizada con cola global, tablas de polling por grupo de tipo y orden de despacho

### api-snowq-service — Eliminación de broker-queue-lite (DB-backed queue)
- [x] `SnowRequestEntity` — agregadas columnas `retryCount`, `maxRetries`, `nextRetryAt`, `lastError`
- [x] `SnowRequestService` — nuevos métodos: `findPendingQueue`, `markAsProcessing`, `markAsRetry`, `recoverStuckProcessing`
- [x] `SnowRequestWorkerService` — reemplaza los 28 loops TCP: poll a DB cada 500ms, marca IN_PROGRESS en batch, encola en PQueue
- [x] `SnowRequestProcessingService` — simplificado: `enqueue()` persiste directo en DB con status=QUEUED (sin broker)
- [x] `SnowRequestQueueService` — `enqueue(entity)` sin ack/nack; `processRequest` llama `markAsRetry` con backoff
- [x] Módulos limpiados: eliminado `BrokerClientModule` y `QueueInfrastructureService`
- [x] Retry con backoff por prioridad: CRITICAL=5s, HIGH=15s, MEDIUM=30s, LOW=60s; tras maxRetries=3 → FAILED
- [x] Recovery al arrancar: IN_PROGRESS de más de 5 minutos → QUEUED (proceso caído a mitad de vuelo)

### api-snowq-service — Endpoints DLQ
- [x] `SnowRequestService` — `findFailed()`, `retryFailed(correlationId)`, `retryAllFailed()`
- [x] `GET  /snow-requests/failed` — lista registros FAILED con lastError y retryCount
- [x] `POST /snow-requests/failed/retry-all` — reencola todos los FAILED (resetea retryCount=0)
- [x] `POST /snow-requests/failed/:correlationId/retry` — reencola un FAILED individual
- [x] Orden de rutas correcto: `retry-all` (literal) declarado antes de `/:correlationId/retry` (parámetro)

### api-snowq-service — Correcciones de bugs
- [x] Bug: `enqueue()` no retornaba Promise de `snowQueue.add()` — sin backpressure, la PQueue crecía sin límite
- [x] Variable `payload` muerta en `processConsumedMessage`
- [x] Bug crítico: `ServiceNowFatalError` — `statusCode` default era `400 | 404 | 405 | 409 | 415 | 413 | 422` (bitwise OR = 447). Corregido a `400`
- [x] Bug crítico: `ServiceNowTemporalError` — `statusCode` default era `408 | 429 | 500 | 502 | 503` (bitwise OR = 511). Corregido a `500`
- [x] `CreateIncidenceDto` — eliminado decorador `@Column` de TypeORM (no corresponde en un DTO)
- [x] `constant.config.ts` — eliminadas constantes muertas `incidenceStatus` y `statusToCreatedIncidence` con typo `IN_PROSGRESS`
- [x] `queue-infrastructure.service.ts` — eliminado archivo zombie del broker (no estaba importado en ningún módulo)

### Monolith — Bug crítico `pullEvents()` corregido
- [x] `incident.repository.ts` — eliminado `pullEvents()` del `save()` (el repositorio solo persiste estado)
- [x] `request.repository.ts` — mismo fix
- [x] `incident.service.ts` — todos los métodos extraen eventos ANTES del `save()`, luego llaman `saveEvents()` + `eventBus.publishMany(events)` explícitamente
  - `createIncident`, `deliverIncident`, `takeIncident`, `releaseIncident`, `changeStatus`, `validateIncident`, `reopenIncident`, `batchChangeStatus`
- [x] `request.service.ts` — mismo fix en `createRequest` y `updateRequestStatus`

### Monolith — Cierre en modo diferido
- [x] `MonolithReconcilerJob` — al reconciliar un incident con `status=CLOSED`, llama `snService.closeIncidentTicket()` con el sysId recién obtenido

### Monolith — Límite de tamaño del lote
- [x] `POST /internal/incidents/batch-status` — validación `items.length > 50` → `BadRequestException`

### api-snowq-service — Módulo de monitoreo (Nagios/Thruk)
- [x] `STATUS` enum extendido: `CANCELLED` y `EXPIRED`
- [x] `SnowRequestEntity` — columnas `fingerprint` (varchar 512, nullable) y `expiresAt` (datetime, nullable)
- [x] `SnowRequestService` — `findActiveByFingerprint()`, `cancelByFingerprint()`, `expireOverdue()`
- [x] `SnowRequestWorkerService` — chequeo de TTL vencido cada 30s (`expireOverdue`)
- [x] `MonitoringModule` aislado en `/monitoring` — sin impacto en `/snow-requests`
- [x] `ThrukAlertDto` — modela la notificación de Nagios con `notificationType`, `stateType`, `ttlSeconds`
- [x] `MonitoringService` — capa de decisión:
  - IGNORED: ACKNOWLEDGEMENT, FLAPPING*, DOWNTIME*, PROBLEM SOFT
  - RECOVERY → `cancelByFingerprint()` → CANCELLED | TOO_LATE | IGNORED
  - PROBLEM HARD → dedup por fingerprint → QUEUED | DEDUPLICATED
- [x] `POST /monitoring/alerts` — punto de entrada único para Thruk
- [x] `POST /monitoring/cancel/:fingerprint` — cancelación explícita por fingerprint
- [x] Fingerprint construido como `host=X;service=Y` (sin state — misma entidad = mismo ticket)
- [x] Prioridad mapeada desde state de Nagios: DOWN/CRITICAL → CRITICAL, WARNING → HIGH, UNKNOWN → MEDIUM

---

## 🟡 Pendiente importante

### 1. Actualizaciones/cierres no pasan por api-snowq-service

`SnowqAdapter.updateTicket()` y `closeIncidentTicket()` van directo al simulador,
sin circuit breaker ni cola de reintentos propia.

**Decisión pendiente:** ¿Enrutar también por api-snowq-service?
Implicaría agregar nuevos endpoints al servicio:
- `PATCH /snow-requests/incidents/:sysId` — cerrar/actualizar ticket existente
- `PATCH /snow-requests/service-catalog/:sysId` — actualizar request existente

Por ahora el Outbox con backoff actúa como única red de seguridad ante caídas del simulador.

### 2. Batch para Requests

Solo se implementó batch para `Incident`. Falta:
- `BatchStatusChangeItem` + `BatchChangeResult` en el port de Request
- `RequestService.batchChangeStatus()` — idempotencia, duplicados, routing por estado
- `POST /internal/requests/batch-status` en controller
- Handler equivalente a `IncidentStatusChangedHandler` para los estados de Request (CLOSED, REOPENED)
- Límite de 50 items en el nuevo controller

### 3. Cierre deferred para Requests (equivalente al fix de Incidents)

El `MonolithReconcilerJob` ya cierra incidents en SN cuando reconcilia un ticket
en estado CLOSED. Falta aplicar la misma lógica para `Request`:
- Al reconciliar un request con `status=CLOSED`, llamar `snService.closeRequestTicket()`
  (o el equivalente para `sc_req_item` en el adapter)

---

## 🟢 Pendiente deseable (bajo impacto)

### 4. Tests unitarios

Ninguna de las piezas implementadas tiene tests:
- `OutboxWorkerService` — backoff, DLQ, retry
- `SnowqAdapter` — dos fases, extractImmediateResult/extractDeferredResult
- `MonolithReconcilerJob` — DELIVERED / QUEUED / FAILED / deferred-close paths
- `IncidentStatusChangedHandler` — skip si no hay sysId, close, reopen
- `IncidentService.batchChangeStatus()` — duplicados, idempotencia, fallos parciales
- `incident.service.ts` / `request.service.ts` — pullEvents extraído antes de save

### 5. Observabilidad

Actualmente no hay métricas ni alertas para:
- Tasa de `failed` en el batch (ítems que fallan sistemáticamente)
- Eventos con `failed_at` en el Outbox (DLQ lógica sin alertas)
- Tickets en modo deferred hace más de X minutos (ReconcilerJob atascado)
- Tamaño de la PQueue global de api-snowq-service (mensajes acumulados sin procesar)
- Frecuencia de circuit breaker abierto hacia ServiceNow

---

## Orden de ataque recomendado

```
1. Decidir si updateTicket/closeIncident pasan por api-snowq-service
2. Batch para Requests (si se necesita)
3. Cierre deferred para Requests en ReconcilerJob
4. Tests
5. Observabilidad
```
